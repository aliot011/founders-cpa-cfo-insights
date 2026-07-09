import { Router } from 'express';
import {
  clearLoginFailures,
  clearSessionCookie,
  hashPassword,
  loginBlocked,
  newRawToken,
  passwordProblem,
  recordLoginFailure,
  requireAuth,
  SESSION_COOKIE,
  setSessionCookie,
  sha256,
  verifyPassword,
} from '../auth.ts';
import {
  consumeAuthToken,
  createSession,
  deleteSession,
  getUser,
  getUserByEmail,
  getUserCompanyRealms,
  listConnections,
  peekAuthToken,
  setUserPassword,
} from '../db.ts';
import { ApiError } from '../errors.ts';

export const sessionRouter = Router();

/** The signed-in user payload the frontend keys everything off. */
function mePayload(userId: number) {
  const user = getUser(userId);
  if (!user) throw new ApiError(401, 'Sign in required.', 'unauthorized');
  const realms = user.role === 'client' ? getUserCompanyRealms(user.id) : null;
  const companies = listConnections()
    .filter((c) => !realms || realms.has(c.realm_id))
    .map((c) => ({ realmId: c.realm_id, companyName: c.company_name }));
  return { id: user.id, name: user.name, email: user.email, role: user.role, companies };
}

sessionRouter.get('/me', (req, res) => {
  if (!req.user) throw new ApiError(401, 'Sign in required.', 'unauthorized');
  res.json(mePayload(req.user.id));
});

sessionRouter.post('/login', (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw new ApiError(400, 'Email and password are required.', 'bad_request');
  }
  const key = `${email.trim().toLowerCase()}|${req.ip}`;
  if (loginBlocked(key)) {
    throw new ApiError(429, 'Too many attempts. Try again in a few minutes.', 'bad_request');
  }

  const user = getUserByEmail(email.trim());
  const ok = user?.password_hash ? verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) {
    recordLoginFailure(key);
    throw new ApiError(401, 'Invalid email or password.', 'unauthorized');
  }
  clearLoginFailures(key);

  const raw = newRawToken();
  createSession(user.id, sha256(raw));
  setSessionCookie(req, res, raw);
  res.json(mePayload(user.id));
});

sessionRouter.post('/logout', (req, res) => {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (typeof raw === 'string' && raw) deleteSession(sha256(raw));
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Validate an invite/reset link before showing the set-password form. */
sessionRouter.get('/token-info', (req, res) => {
  const token = String(req.query.token ?? '');
  const row = token ? peekAuthToken(sha256(token)) : null;
  const user = row ? getUser(row.user_id) : undefined;
  if (!row || !user) {
    res.json({ valid: false });
    return;
  }
  res.json({ valid: true, purpose: row.purpose, email: user.email, name: user.name });
});

/** Set a password via an invite or reset link; signs the user in. */
sessionRouter.post('/set-password', (req, res) => {
  const { token, password } = (req.body ?? {}) as { token?: string; password?: string };
  if (typeof token !== 'string' || typeof password !== 'string' || !token) {
    throw new ApiError(400, 'A token and password are required.', 'bad_request');
  }
  const tokenHash = sha256(token);
  const row = peekAuthToken(tokenHash);
  const user = row ? getUser(row.user_id) : undefined;
  if (!row || !user) {
    throw new ApiError(400, 'This link is invalid or has expired. Ask your advisor for a new one.', 'bad_request');
  }
  const problem = passwordProblem(password, user.email);
  if (problem) throw new ApiError(400, problem, 'bad_request');

  consumeAuthToken(tokenHash);
  setUserPassword(user.id, hashPassword(password)); // also revokes existing sessions

  const raw = newRawToken();
  createSession(user.id, sha256(raw));
  setSessionCookie(req, res, raw);
  res.json(mePayload(user.id));
});

/** Change password while signed in; keeps this session, revokes the rest. */
sessionRouter.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = (req.body ?? {}) as { currentPassword?: string; newPassword?: string };
  const user = getUserByEmail(req.user!.email);
  if (!user?.password_hash || typeof currentPassword !== 'string' || !verifyPassword(currentPassword, user.password_hash)) {
    throw new ApiError(401, 'Current password is incorrect.', 'unauthorized');
  }
  if (typeof newPassword !== 'string') throw new ApiError(400, 'A new password is required.', 'bad_request');
  const problem = passwordProblem(newPassword, user.email);
  if (problem) throw new ApiError(400, problem, 'bad_request');

  setUserPassword(user.id, hashPassword(newPassword));
  const raw = newRawToken();
  createSession(user.id, sha256(raw));
  setSessionCookie(req, res, raw);
  res.json({ ok: true });
});

/**
 * Forgot password. No mailer is wired up yet, so this is a stub that always
 * succeeds; resets are issued by an admin from the Users page for now.
 */
sessionRouter.post('/forgot', (_req, res) => {
  res.json({ ok: true });
});
