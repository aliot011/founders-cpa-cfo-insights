import { Router } from 'express';
import {
  createUser,
  deleteUser,
  getConnection,
  getUser,
  listUsers,
  updateUser,
  type UserCompany,
  type UserRole,
  type UserRow,
} from '../db.ts';
import { ApiError } from '../errors.ts';

export const usersRouter = Router();

const ROLES = new Set<UserRole>(['admin', 'advisor', 'client']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toApi(u: UserRow & { companies: UserCompany[] }) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    companies: u.companies.map((c) => ({ realmId: c.realm_id, companyName: c.company_name })),
    createdAt: u.created_at,
  };
}

/**
 * Client users are scoped to one or more connected companies; admin/advisor
 * roles see everything, so nothing is stored for them.
 */
function resolveRealms(role: UserRole, realmIds: unknown): string[] {
  if (role !== 'client') return [];
  if (!Array.isArray(realmIds) || realmIds.length === 0) {
    throw new ApiError(400, 'Client users need at least one company (realmIds).', 'bad_request');
  }
  const unique = [...new Set(realmIds.map(String))];
  for (const realmId of unique) {
    if (!getConnection(realmId)) {
      throw new ApiError(404, `No QuickBooks connection for realm ${realmId}`, 'not_found');
    }
  }
  return unique;
}

usersRouter.get('/', (_req, res) => {
  res.json(listUsers().map(toApi));
});

usersRouter.post('/', (req, res) => {
  const { email, name, role, realmIds } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    throw new ApiError(400, 'A valid email is required.', 'bad_request');
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new ApiError(400, 'A name is required.', 'bad_request');
  }
  if (typeof role !== 'string' || !ROLES.has(role as UserRole)) {
    throw new ApiError(400, "Role must be 'admin', 'advisor', or 'client'.", 'bad_request');
  }
  try {
    const user = createUser({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: role as UserRole,
      realmIds: resolveRealms(role as UserRole, realmIds),
    });
    res.status(201).json(toApi(user));
  } catch (err) {
    if ((err as { code?: string }).code?.startsWith('SQLITE_CONSTRAINT')) {
      throw new ApiError(400, `A user with the email ${email} already exists.`, 'bad_request');
    }
    throw err;
  }
});

usersRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getUser(id);
  if (!existing) throw new ApiError(404, `No user ${req.params.id}`, 'not_found');

  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields: { name?: string; role?: UserRole; realmIds?: string[] } = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new ApiError(400, 'Name cannot be empty.', 'bad_request');
    }
    fields.name = body.name.trim();
  }
  const role = ('role' in body ? body.role : existing.role) as UserRole;
  if ('role' in body && !ROLES.has(role)) {
    throw new ApiError(400, "Role must be 'admin', 'advisor', or 'client'.", 'bad_request');
  }
  if ('role' in body || 'realmIds' in body) {
    fields.role = role;
    fields.realmIds = resolveRealms(
      role,
      'realmIds' in body ? body.realmIds : existing.companies.map((c) => c.realm_id),
    );
  }
  res.json(toApi(updateUser(id, fields)));
});

usersRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getUser(id)) throw new ApiError(404, `No user ${req.params.id}`, 'not_found');
  deleteUser(id);
  res.json({ ok: true });
});
