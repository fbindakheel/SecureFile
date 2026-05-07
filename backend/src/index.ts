import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import workspacesRoutes from './routes/workspaces';
import filesRoutes from './routes/files';
import sharesRoutes from './routes/shares';
import fs from 'fs';

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
