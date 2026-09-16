import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// Hash both sides first; timingSafeEqual throws when the lengths differ.
export function safeEqual(a: string, b: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

// Token format is "<expiry ms>.<hmac>". There's one shared login, so nothing
// user-specific needs to go in it.
export function signSession(secret: string, expiresAt = Date.now() + SESSION_TTL_MS) {
  return `${expiresAt}.${sign(secret, String(expiresAt))}`;
}

export function verifySession(secret: string, token: string | undefined) {
  if (!token) return false;
  const [expiresAt, signature = ''] = token.split('.');
  // `>` rather than `!<` so a NaN expiry fails.
  return Number(expiresAt) > Date.now() && safeEqual(signature, sign(secret, expiresAt));
}

export function readCookie(header: string | undefined, name: string) {
  for (const part of header?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

export const requireSession =
  (secret: string): RequestHandler =>
  (req, res, next) => {
    if (verifySession(secret, readCookie(req.headers.cookie, SESSION_COOKIE))) return next();
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } });
  };

export const requireBearer =
  (secret: string): RequestHandler =>
  (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (token && safeEqual(token, secret)) return next();
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret.' } });
  };
