import { Router } from 'express';
import prisma from '../prismaClient';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';

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

export default router;
