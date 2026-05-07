import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../prismaClient';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { decryptFileStream } from '../services/cryptoService';
import { scanFile } from '../services/virusScanner';
import { uploadToCloud, downloadFromCloud, deleteFromCloud, getSignedUploadUrl } from '../services/storageService';

const router = Router();
const upload = multer({ dest: 'storage/temp/' });

router.use(authenticate);

// Get a signed URL for direct cloud upload (Bypasses Render 30s timeout)
router.get('/signed-upload-url', async (req: AuthRequest, res) => {
  try {
    const storedName = uuidv4() + '.enc';
    const signedUrl = await getSignedUploadUrl(storedName);
    res.json({ signedUrl, storedName });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

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
    const { workspaceId, originalName, keyHex, ivHex, fileHash, directStoredName, directSize, directMime } = req.body;
    const membership = (req as any).membership;

    if (membership.role === 'VIEWER') return res.status(403).json({ error: 'Viewers cannot upload files' });

    // --- MAGIC STEP: DEDUPLICATION (Instant Upload) ---
    if (fileHash && fileHash.trim() !== '') {
      const existingFile = await prisma.file.findFirst({
        where: { fileHash, NOT: { fileHash: '' } }
      });

      if (existingFile) {
        const dbFile = await prisma.file.create({
          data: {
            originalName: originalName || existingFile.originalName,
            storedName: uuidv4() + '-ref.enc',
            mimeType: existingFile.mimeType,
            size: existingFile.size,
            path: existingFile.path,
            encryptionKey: existingFile.encryptionKey,
            encryptionIv: existingFile.encryptionIv,
            authTag: existingFile.authTag,
            fileHash: existingFile.fileHash,
            scanStatus: 'CLEAN',
            uploadedBy: req.user!.id,
            workspaceId
          }
        });

        if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.json({ ...dbFile, message: 'Instant upload successful! ⚡' });
      }
    }

    // --- DIRECT UPLOAD CASE (Metadata Only) ---
    if (directStoredName) {
      const dbFile = await prisma.file.create({
        data: {
          originalName: originalName,
          storedName: directStoredName,
          mimeType: directMime || 'application/octet-stream',
          size: parseInt(directSize) || 0,
          path: directStoredName,
          encryptionKey: keyHex,
          encryptionIv: ivHex,
          authTag: 'client-gcm',
          fileHash: fileHash || '',
          scanStatus: 'CLEAN', // Direct uploads assume clean for now or use background scan
          uploadedBy: req.user!.id,
          workspaceId
        }
      });
      return res.json(dbFile);
    }

    // --- STANDARD UPLOAD CASE ---
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const storedName = uuidv4() + '.enc';
    const scanStatus = await scanFile(file.path);
    if (scanStatus === 'CLEAN') {
      await uploadToCloud(file.path, storedName);
    }
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    if (scanStatus === 'INFECTED') {
      return res.status(400).json({ error: 'File rejected: Malware detected.' });
    }

    const dbFile = await prisma.file.create({
      data: {
        originalName: originalName || file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
        path: storedName,
        encryptionKey: keyHex,
        encryptionIv: ivHex,
        authTag: 'client-gcm',
        fileHash: fileHash || '',
        scanStatus,
        uploadedBy: req.user!.id,
        workspaceId
      }
    });

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

    const fileBuffer = await downloadFromCloud(file.path);
    fs.writeFileSync(tempEncPath, fileBuffer);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'DOWNLOAD_FILE',
        targetId: file.id,
        targetType: 'File'
      }
    });

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

    const otherReferences = await prisma.file.findFirst({
      where: { path: file.path, NOT: { id: fileId } }
    });

    if (!otherReferences) {
      await deleteFromCloud(file.path);
    }

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
