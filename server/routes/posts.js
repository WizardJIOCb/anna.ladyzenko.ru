import { Router } from 'express';
import { getDb } from '../db.js';
import { generateFingerprint } from '../fingerprint.js';
import rateLimit from 'express-rate-limit';

const router = Router();

const likeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper: get summed like count (Instagram + site)
function getTotalLikes(postCode, instagramData) {
  const db = getDb();
  const siteLikes = db.prepare('SELECT COUNT(*) as count FROM post_likes WHERE post_code = ?').get(postCode)?.count || 0;
  const igLikes = instagramData[postCode]?.like_count || 0;
  return igLikes + siteLikes;
}

// POST /api/posts/:code/like
router.post('/:code/like', likeLimiter, (req, res) => {
  const { code } = req.params;
  const fp = generateFingerprint(req, req.user?.id);
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  try {
    db.prepare('INSERT INTO post_likes (post_code, fingerprint, created_at) VALUES (?, ?, ?)')
      .run(code, fp, now);
  } catch (err) {
    // UNIQUE constraint = already liked, that's fine
    if (!err.message.includes('UNIQUE')) throw err;
  }

  const total = getTotalLikes(code, req.app.locals.instagramData);
  res.json({ liked: true, total_likes: total });
});

// DELETE /api/posts/:code/like
router.delete('/:code/like', likeLimiter, (req, res) => {
  const { code } = req.params;
  const fp = generateFingerprint(req, req.user?.id);
  const db = getDb();

  db.prepare('DELETE FROM post_likes WHERE post_code = ? AND fingerprint = ?')
    .run(code, fp);

  const total = getTotalLikes(code, req.app.locals.instagramData);
  res.json({ liked: false, total_likes: total });
});

// GET /api/posts/:code/likes
router.get('/:code/likes', (req, res) => {
  const { code } = req.params;
  const fp = generateFingerprint(req, req.user?.id);
  const db = getDb();

  const liked = !!db.prepare('SELECT 1 FROM post_likes WHERE post_code = ? AND fingerprint = ?').get(code, fp);
  const total = getTotalLikes(code, req.app.locals.instagramData);

  res.json({ liked, total_likes: total });
});

// GET /api/posts/likes?codes=a,b,c — bulk fetch
router.get('/likes', (req, res) => {
  const codesStr = req.query.codes;
  if (!codesStr) return res.json({});

  const codes = codesStr.split(',').filter(Boolean).slice(0, 100);
  const fp = generateFingerprint(req, req.user?.id);
  const db = getDb();
  const instagramData = req.app.locals.instagramData;

  const result = {};
  for (const code of codes) {
    const liked = !!db.prepare('SELECT 1 FROM post_likes WHERE post_code = ? AND fingerprint = ?').get(code, fp);
    const total = getTotalLikes(code, instagramData);
    result[code] = { liked, total_likes: total };
  }

  res.json(result);
});

export default router;
