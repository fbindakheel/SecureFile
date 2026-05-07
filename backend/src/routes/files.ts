import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../prismaClient';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { encryptFile, decryptFileStream } from '../services/cryptoService';
import { scanFile } from '../services/virusScanner';
import { uploadToCloud, downloadFromCloud } from '../services/storageService';

const router = Router();

const upload = multer({ dest: 'storage/temp/' });

router.use(authenticate);

// Middleware to check workspace access
const checkWorkspaceAccess = async (req: AuthRequest, res: any, next: any) => {
  try {
    const workspaceId = (req.body?.workspaceId || req.params?.workspaceId) as string;
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user!.id, workspaceId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    (req as any).membership = membership;
    next();
  } catch (error) {
    console.error('checkWorkspaceAccess error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

router.post('/upload', upload.single('file'), checkWorkspaceAccess, async (req: AuthRequest, res) => {
  try {
    const file = req.file;
    const { workspaceId } = req.body;
    const membership = (req as any).membership;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (membership.role === 'VIEWER') return res.status(403).json({ error: 'Viewers cannot upload files' });

    const storedName = uuidv4() + '.enc';
    const tempEncryptedPath = path.join('storage/temp', storedName);

    // 1. Encrypt the file locally
    const { iv, authTag } = await encryptFile(file.path, tempEncryptedPath);

    // 2. Scan the original temporary file
    const scanStatus = await scanFile(file.path);

    // 3. Upload to Cloud (Supabase)
    if (scanStatus === 'CLEAN') {
      await uploadToCloud(tempEncryptedPath, storedName);
    }

    // 4. Cleanup local temp files
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    if (fs.existsSync(tempEncryptedPath)) fs.unlinkSync(tempEncryptedPath);

    if (scanStatus === 'INFECTED') {
      return res.status(400).json({ error: 'File rejected: Malware detected.' });
    }

    // 5. Save to DB
    const dbFile = await prisma.file.create({
      data: {
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
        path: storedName, // Store the cloud file name/path
        encryptionIv: iv,
        authTag: authTag,
        scanStatus,
        uploadedBy: req.user!.id,
        workspaceId
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPLOAD_FILE',
        targetId: dbFile.id,
        targetType: 'File'
      }
    });

    res.json(dbFile);
  } catch (error) {
    console.error(error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/workspace/:workspaceId', checkWorkspaceAccess, async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const files = await prisma.file.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(files);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:fileId/download', async (req: AuthRequest, res) => {
  const tempEncPath = path.join('storage/temp', `dl-${uuidv4()}.enc`);
  try {
    const fileId = req.params.fileId as string;
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Check access
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user!.id, workspaceId: file.workspaceId } }
    });

    if (!membership) return res.status(403).json({ error: 'Access denied' });

    // 1. Download from Cloud to local temp
    const fileBuffer = await downloadFromCloud(file.storedName);
    fs.writeFileSync(tempEncPath, fileBuffer);

    // 2. Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'DOWNLOAD_FILE',
        targetId: file.id,
        targetType: 'File'
      }
    });

    // 3. Decrypt and stream to response
    const decipher = decryptFileStream(tempEncPath, file.encryptionIv, file.authTag);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);

    const fileStream = fs.createReadStream(tempEncPath);
    
    fileStream.pipe(decipher).pipe(res);

    res.on('finish', () => {
      if (fs.existsSync(tempEncPath)) fs.unlinkSync(tempEncPath);
    });

router.delete('/:fileId', async (req: AuthRequest, res) => {
  try {
    const fileId = req.params.fileId as string;
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Check access (Must be ADMIN or EDITOR to delete)
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user!.id, workspaceId: file.workspaceId } }
    });

    if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'EDITOR')) {
      return res.status(403).json({ error: 'Permission denied. Only Admins and Editors can delete files.' });
    }

    // 1. Delete from Cloud
    await deleteFromCloud(file.storedName);

    // 2. Delete from DB
    await prisma.file.delete({ where: { id: fileId } });

    // 3. Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'DELETE_FILE',
        targetId: fileId,
        targetType: 'File'
      }
    });

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
