import { Router } from 'express';
import { verifyGoogleToken, createJWT, upsertUser, COOKIE_MAX_AGE } from '../auth.js';

const router = Router();

// POST /api/auth/google — exchange Google credential for JWT cookie
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'credential is required' });
    }

    const googleUser = await verifyGoogleToken(credential);
    const userId = upsertUser(googleUser);
    const token = createJWT(userId);

    res.cookie('session_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    res.json({
      id: userId,
      email: googleUser.email,
      name: googleUser.name,
      avatar_url: googleUser.avatar_url,
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// GET /api/auth/me — current user
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.user);
});

// POST /api/auth/logout — clear cookie
router.post('/logout', (req, res) => {
  res.clearCookie('session_token', { path: '/' });
  res.json({ ok: true });
});

export default router;
