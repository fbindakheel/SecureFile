import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../prismaClient';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { decryptFileStream } from '../services/cryptoService';
import { scanFile } from '../services/virusScanner';
import { uploadToCloud, downloadFromCloud, deleteFromCloud } from '../services/storageService';

const router = Router();
const upload = multer({ dest: 'storage/temp/' });

router.use(authenticate);

// Get all videos across all workspaces for the user
router.get('/all-videos', async (req: AuthRequest, res) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user!.id }
    });
    const workspaceIds = memberships.map(m => m.workspaceId);

    const videos = await prisma.file.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        mimeType: { startsWith: 'video/' }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(videos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    const { workspaceId, originalName, keyHex, ivHex } = req.body;
    const membership = (req as any).membership;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (membership.role === 'VIEWER') return res.status(403).json({ error: 'Viewers cannot upload files' });

    const storedName = uuidv4() + '.enc';

    // 1. Scan the file (even if encrypted, we scan for known patterns, but ideally scan happens before encryption on client)
    // For now, we still scan on server for basic protection
    const scanStatus = await scanFile(file.path);

    // 2. Upload the already encrypted file to Cloud (Supabase)
    if (scanStatus === 'CLEAN') {
      await uploadToCloud(file.path, storedName);
    }

    // 3. Cleanup local temp file
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    if (scanStatus === 'INFECTED') {
      return res.status(400).json({ error: 'File rejected: Malware detected.' });
    }

    // 4. Save to DB (Store the keys provided by the client)
    const dbFile = await prisma.file.create({
      data: {
        originalName: originalName || file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
        path: storedName,
        encryptionKey: keyHex,
        encryptionIv: ivHex,
        authTag: 'client-gcm', // GCM tag is typically at the end of the blob in Web Crypto
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

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user!.id, workspaceId: file.workspaceId } }
    });

    if (!membership) return res.status(403).json({ error: 'Access denied' });

    const fileBuffer = await downloadFromCloud(file.storedName);
    fs.writeFileSync(tempEncPath, fileBuffer);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'DOWNLOAD_FILE',
        targetId: file.id,
        targetType: 'File'
      }
    });

    // Decrypt using the stored client key
    const decipher = decryptFileStream(tempEncPath, file.encryptionIv, file.encryptionKey);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);

    const fileStream = fs.createReadStream(tempEncPath);
    fileStream.pipe(decipher).pipe(res);

    res.on('finish', () => {
      if (fs.existsSync(tempEncPath)) fs.unlinkSync(tempEncPath);
    });
  } catch (error) {
    console.error(error);
    if (fs.existsSync(tempEncPath)) fs.unlinkSync(tempEncPath);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:fileId', async (req: AuthRequest, res) => {
  try {
    const fileId = req.params.fileId as string;
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return res.status(404).json({ error: 'File not found' });

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user!.id, workspaceId: file.workspaceId } }
    });

    if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'EDITOR')) {
      return res.status(403).json({ error: 'Permission denied. Only Admins and Editors can delete files.' });
    }

    await deleteFromCloud(file.storedName);
    await prisma.file.delete({ where: { id: fileId } });

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
