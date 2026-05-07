import { Router } from 'express';
import prisma from '../prismaClient';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { deleteFromCloud } from '../services/storageService';

const router = Router();
router.use(authenticate);

// Create a new workspace
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Workspace name required' });

    const workspace = await prisma.workspace.create({
      data: {
        name,
        members: {
          create: {
            userId: req.user!.id,
            role: 'ADMIN'
          }
        }
      }
    });

    res.json(workspace);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List user's workspaces
router.get('/', async (req: AuthRequest, res) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user!.id },
      include: { workspace: true }
    });
    res.json(memberships.map(m => ({ ...m.workspace, role: m.role })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const workspaceId = req.params.id as string;

    // Check if user is ADMIN
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user!.id, workspaceId } }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only Admins can delete workspaces' });
    }

    // 1. Get all files in workspace to delete from Cloud
    const files = await prisma.file.findMany({
      where: { workspaceId }
    });

    for (const file of files) {
      try {
        await deleteFromCloud(file.storedName);
      } catch (err) {
        console.error(`Failed to delete file ${file.storedName} from cloud:`, err);
      }
    }

    // 2. Delete workspace (Prisma handles cascade delete for members, files, etc. in schema)
    await prisma.workspace.delete({
      where: { id: workspaceId }
    });

    // 3. Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'DELETE_WORKSPACE',
        targetId: workspaceId,
        targetType: 'Workspace'
      }
    });

    res.json({ message: 'Workspace deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
