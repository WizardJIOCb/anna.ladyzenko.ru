import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { getDb } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const JWT_EXPIRES = '7d';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function verifyGoogleToken(credential) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    google_id: payload.sub,
    email: payload.email,
    name: payload.name,
    avatar_url: payload.picture,
  };
}

export function createJWT(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function decodeJWT(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch {
    return null;
  }
}

export function upsertUser({ google_id, email, name, avatar_url }) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const existing = db.prepare('SELECT id FROM users WHERE google_id = ?').get(google_id);
  if (existing) {
    db.prepare('UPDATE users SET email = ?, name = ?, avatar_url = ? WHERE google_id = ?')
      .run(email, name, avatar_url, google_id);
    return existing.id;
  }

  const result = db.prepare('INSERT INTO users (google_id, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(google_id, email, name, avatar_url, now);
  return result.lastInsertRowid;
}

export function getUserById(id) {
  return getDb().prepare('SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?').get(id);
}

// Middleware: attaches req.user (or null) from JWT cookie
export function authMiddleware(req, res, next) {
  const token = req.cookies?.session_token;
  if (token) {
    const userId = decodeJWT(token);
    if (userId) {
      req.user = getUserById(userId);
    }
  }
  if (!req.user) req.user = null;
  next();
}

export { COOKIE_MAX_AGE };
