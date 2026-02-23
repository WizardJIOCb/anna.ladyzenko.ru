import { Router } from 'express';
import { getDb } from '../db.js';
import { generateFingerprint } from '../fingerprint.js';
import rateLimit from 'express-rate-limit';

const router = Router();

const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many comments, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const commentLikeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '');
}

// GET /api/posts/:code/comments — nested comments with like info
router.get('/posts/:code/comments', (req, res) => {
  const { code } = req.params;
  const fp = generateFingerprint(req, req.user?.id);
  const db = getDb();

  const rows = db.prepare(`
    SELECT c.id, c.post_code, c.user_id, c.guest_name, c.parent_id, c.text, c.created_at,
           u.name AS user_name, u.avatar_url AS user_avatar
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.post_code = ?
    ORDER BY c.created_at ASC
  `).all(code);

  // Enrich with like info
  const enriched = rows.map(row => {
    const likeCount = db.prepare('SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?').get(row.id)?.count || 0;
    const likedByMe = !!db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND fingerprint = ?').get(row.id, fp);

    return {
      id: row.id,
      post_code: row.post_code,
      user: row.user_id ? { name: row.user_name, avatar_url: row.user_avatar } : null,
      guest_name: row.guest_name,
      parent_id: row.parent_id,
      text: row.text,
      created_at: row.created_at,
      likes: likeCount,
      liked_by_me: likedByMe,
    };
  });

  // Nest replies
  const byId = new Map();
  const topLevel = [];

  for (const comment of enriched) {
    comment.replies = [];
    byId.set(comment.id, comment);
  }
  for (const comment of enriched) {
    if (comment.parent_id && byId.has(comment.parent_id)) {
      byId.get(comment.parent_id).replies.push(comment);
    } else {
      topLevel.push(comment);
    }
  }

  res.json(topLevel);
});

// POST /api/posts/:code/comments — create comment
router.post('/posts/:code/comments', commentLimiter, (req, res) => {
  const { code } = req.params;
  const { text, guest_name, parent_id } = req.body;

  // Validate text
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }
  const cleanText = stripHtml(text.trim());
  if (cleanText.length < 1 || cleanText.length > 2000) {
    return res.status(400).json({ error: 'text must be 1-2000 characters' });
  }

  // Validate guest_name if not authenticated
  let guestName = null;
  if (!req.user) {
    if (!guest_name || typeof guest_name !== 'string') {
      return res.status(400).json({ error: 'guest_name is required for unauthenticated users' });
    }
    guestName = stripHtml(guest_name.trim());
    if (guestName.length < 1 || guestName.length > 50) {
      return res.status(400).json({ error: 'guest_name must be 1-50 characters' });
    }
  }

  // Validate parent_id if provided
  const db = getDb();
  if (parent_id) {
    const parent = db.prepare('SELECT id, post_code FROM comments WHERE id = ?').get(parent_id);
    if (!parent || parent.post_code !== code) {
      return res.status(400).json({ error: 'Invalid parent_id' });
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare(
    'INSERT INTO comments (post_code, user_id, guest_name, parent_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(code, req.user?.id || null, guestName, parent_id || null, cleanText, now);

  const fp = generateFingerprint(req, req.user?.id);

  res.status(201).json({
    id: result.lastInsertRowid,
    post_code: code,
    user: req.user ? { name: req.user.name, avatar_url: req.user.avatar_url } : null,
    guest_name: guestName,
    parent_id: parent_id || null,
    text: cleanText,
    created_at: now,
    likes: 0,
    liked_by_me: false,
    replies: [],
  });
});

// POST /api/comments/:id/like — like a comment
router.post('/comments/:id/like', commentLikeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const fp = generateFingerprint(req, req.user?.id);
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const comment = db.prepare('SELECT id FROM comments WHERE id = ?').get(id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  try {
    db.prepare('INSERT INTO comment_likes (comment_id, fingerprint, created_at) VALUES (?, ?, ?)')
      .run(id, fp, now);
  } catch (err) {
    if (!err.message.includes('UNIQUE')) throw err;
  }

  const total = db.prepare('SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?').get(id)?.count || 0;
  res.json({ liked: true, total_likes: total });
});

// DELETE /api/comments/:id/like — unlike a comment
router.delete('/comments/:id/like', commentLikeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const fp = generateFingerprint(req, req.user?.id);
  const db = getDb();

  const comment = db.prepare('SELECT id FROM comments WHERE id = ?').get(id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  db.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND fingerprint = ?')
    .run(id, fp);

  const total = db.prepare('SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?').get(id)?.count || 0;
  res.json({ liked: false, total_likes: total });
});

export default router;
