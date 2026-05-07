import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import prisma from '../prismaClient';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { decryptFileStream } from '../services/cryptoService';
import { downloadFromCloud } from '../services/storageService';

const router = Router();

// Create a shareable link
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { fileId, password, expiresInDays } = req.body;

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return res.status(404).json({ error: 'File not found' });

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user!.id, workspaceId: file.workspaceId } }
    });

    if (!membership || membership.role === 'VIEWER') {
      return res.status(403).json({ error: 'Not authorized to share this file' });
    }

    const token = uuidv4();
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    let expiresAt = null;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const link = await prisma.sharedLink.create({
      data: {
        fileId,
        token,
        passwordHash,
        expiresAt
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'CREATE_SHARE_LINK',
        targetId: link.id,
        targetType: 'SharedLink'
      }
    });

    res.json({ token: link.token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Access a shareable link
router.post('/:token', async (req, res) => {
  const tempEncPath = path.join('storage/temp', `share-${uuidv4()}.enc`);
  try {
    const { token } = req.params;
    const { password } = req.body;

    const link = await prisma.sharedLink.findUnique({
      where: { token },
      include: { file: true }
    });

    if (!link) return res.status(404).json({ error: 'Link not found or expired' });

    if (link.expiresAt && new Date() > link.expiresAt) {
      await prisma.sharedLink.delete({ where: { id: link.id } });
      return res.status(404).json({ error: 'Link has expired' });
    }

    if (link.passwordHash) {
      if (!password) return res.status(401).json({ error: 'Password required' });
      const valid = await bcrypt.compare(password, link.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Invalid password' });
    }

    const file = link.file;

    // 1. Download from Cloud
    const fileBuffer = await downloadFromCloud(file.storedName);
    fs.writeFileSync(tempEncPath, fileBuffer);

    // 2. Audit log
    await prisma.auditLog.create({
      data: {
        action: 'ACCESS_SHARE_LINK',
        targetId: link.id,
        targetType: 'SharedLink'
      }
    });

    // 3. Decrypt and stream
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

export default router;
