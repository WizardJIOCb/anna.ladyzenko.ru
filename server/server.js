import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import { authMiddleware } from './auth.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import commentRoutes from './routes/comments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8000').split(',').map(s => s.trim());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware);

// Load Instagram data into memory for like count summing
const igDataPath = process.env.INSTAGRAM_DATA_PATH || path.join(__dirname, '..', 'data', 'instagram_data_local.json');
try {
  const raw = JSON.parse(readFileSync(igDataPath, 'utf-8'));
  const dataMap = {};
  for (const post of raw.posts) {
    dataMap[post.code] = { like_count: post.like_count, comment_count: post.comment_count };
  }
  app.locals.instagramData = dataMap;
  console.log(`Loaded Instagram data: ${raw.posts.length} posts`);
} catch (err) {
  console.error('Failed to load Instagram data:', err.message);
  app.locals.instagramData = {};
}

// Initialize database
initDb();

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api', commentRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
