import crypto from 'crypto';

export function generateFingerprint(req, userId) {
  if (userId) {
    return `user:${userId}`;
  }
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress;
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}:${ua}`).digest('hex');
}
