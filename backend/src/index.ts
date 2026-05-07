import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import workspacesRoutes from './routes/workspaces';
import filesRoutes from './routes/files';
import sharesRoutes from './routes/shares';
import fs from 'fs';
import { Server } from 'socket.io';

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure storage directory exists
const storagePath = './storage';
if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true });
}
const tempPath = './storage/temp';
if (!fs.existsSync(tempPath)) {
  fs.mkdirSync(tempPath, { recursive: true });
}

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspacesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/shares', sharesRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Watch Together Sync Server (Socket.io)
const io = new Server(server, {
  cors: {
    origin: '*', 
  }
});

io.on('connection', (socket) => {
  socket.on('join-workspace', (workspaceId) => {
    socket.join(workspaceId);
  });

  socket.on('video-event', ({ workspaceId, event, data }) => {
    socket.to(workspaceId).emit('video-update', { event, data });
  });

  socket.on('send-message', ({ workspaceId, message, user }) => {
    io.to(workspaceId).emit('receive-message', { message, user, timestamp: new Date() });
  });
});
