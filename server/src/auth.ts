import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '../../src/types.ts';
import { getSessionUser, type SessionUserRow } from './db.ts';
import { ApiError } from './errors.ts';

// ---- Passwords ----------------------------------------------------------

// scrypt parameters per OWASP guidance (N=2^15, r=8, p=1, 32-byte key).
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 128 * 1024 * 1024 });
  return `s2$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 's2') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * 1024 * 1024,
  });
  return timingSafeEqual(actual, expected);
}

/** Small denylist of very common passwords (8+ chars, lowercase compare). */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'iloveyou', 'sunshine', 'princess', 'football', 'baseball',
  'superman', 'trustno1', 'welcome1', 'letmein1', 'admin123', 'abc12345', 'changeme',
  'whatever', 'monkey123', 'dragon123', 'master123', 'shadow123', 'jordan23', 'starwars',
  'computer', 'michelle', 'jennifer', 'babygirl', 'aa123456', '11111111', '00000000',
  'asdfghjkl', 'qazwsxedc', '1q2w3e4r', '1qaz2wsx', 'password!', 'p@ssw0rd', 'quickbooks',
]);

/**
 * Password rules (also shown in the UI): 8-128 characters, not a very common
 * password, and not your email name. Returns the broken rule or null when OK.
 */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be at most 128 characters.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common; pick something less guessable.';
  }
  const localPart = email.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    return 'Password cannot contain your email name.';
  }
  return null;
}

// ---- Tokens (sessions, invites, resets) ---------------------------------

export function newRawToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ---- Session cookie ------------------------------------------------------

export const SESSION_COOKIE = 'ai_session';

export function setSessionCookie(req: Request, res: Response, rawToken: string): void {
  res.cookie(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// ---- Middleware -----------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUserRow;
    }
  }
}

/** Resolve the session cookie into req.user (no rejection here). */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (typeof raw === 'string' && raw) {
    req.user = getSessionUser(sha256(raw)) ?? undefined;
  }
  next();
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new ApiError(401, 'Sign in required.', 'unauthorized');
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new ApiError(401, 'Sign in required.', 'unauthorized');
    if (!roles.includes(req.user.role)) throw new ApiError(403, 'Not allowed.', 'forbidden');
    next();
  };
}

// ---- Login rate limiting (single process, in-memory) ----------------------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

export function loginBlocked(key: string): boolean {
  const now = Date.now();
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= MAX_FAILURES;
}

export function recordLoginFailure(key: string): void {
  const list = failures.get(key) ?? [];
  list.push(Date.now());
  failures.set(key, list);
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}

/** Base URL for links in logs/emails: the request origin when available. */
export function baseUrl(req?: Request): string {
  if (req) return `${req.protocol}://${req.get('host')}`;
  return process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173';
}
