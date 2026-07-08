import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AccountingMethod, AccountMap, LedgerEntry, VendorProfile } from '../../src/types.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.join(repoRoot, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS connections (
  realm_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TEXT NOT NULL,
  refresh_token_expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  company_start_date TEXT,
  sync_start_date TEXT,
  accounting_method TEXT NOT NULL DEFAULT 'Accrual',
  closed_through TEXT,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS datasets (
  realm_id TEXT PRIMARY KEY REFERENCES connections(realm_id) ON DELETE CASCADE,
  entries_json TEXT NOT NULL,
  account_map_json TEXT NOT NULL,
  opening_balances_json TEXT NOT NULL DEFAULT '{}',
  vendors_json TEXT NOT NULL DEFAULT '[]',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  notes_json TEXT NOT NULL DEFAULT '[]',
  last_synced_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  realm_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  entry_count INTEGER,
  message TEXT
);
`);

// Pre-release users table briefly had a single realm_id column; recreate
// with the many-to-many shape (it never held data).
{
  const uCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (uCols.some((c) => c.name === 'realm_id')) db.exec('DROP TABLE users');
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'advisor', 'client')),
  created_at TEXT NOT NULL
);
-- Client users are scoped to these companies; admins/advisors see all.
CREATE TABLE IF NOT EXISTS user_companies (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL REFERENCES connections(realm_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, realm_id)
);
`);

// Migrate databases created before newer columns existed.
{
  const cols = db.prepare('PRAGMA table_info(connections)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'accounting_method')) {
    db.exec(`ALTER TABLE connections ADD COLUMN accounting_method TEXT NOT NULL DEFAULT 'Accrual'`);
  }
  if (!cols.some((c) => c.name === 'closed_through')) {
    db.exec('ALTER TABLE connections ADD COLUMN closed_through TEXT');
  }
  const dsCols = db.prepare('PRAGMA table_info(datasets)').all() as { name: string }[];
  if (!dsCols.some((c) => c.name === 'opening_balances_json')) {
    db.exec(`ALTER TABLE datasets ADD COLUMN opening_balances_json TEXT NOT NULL DEFAULT '{}'`);
  }
  if (!dsCols.some((c) => c.name === 'vendors_json')) {
    db.exec(`ALTER TABLE datasets ADD COLUMN vendors_json TEXT NOT NULL DEFAULT '[]'`);
  }
}

export interface ConnectionRow {
  realm_id: string;
  company_name: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  status: 'ok' | 'needs_reauth';
  company_start_date: string | null;
  sync_start_date: string | null;
  accounting_method: AccountingMethod;
  /** YYYY-MM; reporting tabs stop at this month. Null = show everything. */
  closed_through: string | null;
  connected_at: string;
  updated_at: string;
}

export interface DatasetRow {
  realm_id: string;
  entries_json: string;
  account_map_json: string;
  opening_balances_json: string;
  vendors_json: string;
  start_date: string;
  end_date: string;
  notes_json: string;
  last_synced_at: string;
}

export interface SyncLogRow {
  id: number;
  realm_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  entry_count: number | null;
  message: string | null;
}

export function getConnection(realmId: string): ConnectionRow | undefined {
  return db.prepare('SELECT * FROM connections WHERE realm_id = ?').get(realmId) as ConnectionRow | undefined;
}

export function listConnections(): ConnectionRow[] {
  return db.prepare('SELECT * FROM connections ORDER BY company_name').all() as ConnectionRow[];
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string; // ISO
  refreshTokenExpiresAt: string; // ISO
}

export function upsertConnection(args: {
  realmId: string;
  companyName: string;
  tokens: TokenSet;
  companyStartDate: string | null;
}): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO connections
       (realm_id, company_name, access_token, refresh_token,
        access_token_expires_at, refresh_token_expires_at,
        status, company_start_date, connected_at, updated_at)
     VALUES (@realmId, @companyName, @accessToken, @refreshToken,
             @accessTokenExpiresAt, @refreshTokenExpiresAt,
             'ok', @companyStartDate, @now, @now)
     ON CONFLICT(realm_id) DO UPDATE SET
       company_name = @companyName,
       access_token = @accessToken,
       refresh_token = @refreshToken,
       access_token_expires_at = @accessTokenExpiresAt,
       refresh_token_expires_at = @refreshTokenExpiresAt,
       status = 'ok',
       company_start_date = @companyStartDate,
       updated_at = @now`,
  ).run({ ...args.tokens, realmId: args.realmId, companyName: args.companyName, companyStartDate: args.companyStartDate, now });
}

/** Update company metadata without touching tokens (they may have rotated since connect). */
export function updateCompanyInfo(realmId: string, companyName: string, companyStartDate: string | null): void {
  db.prepare('UPDATE connections SET company_name = ?, company_start_date = ?, updated_at = ? WHERE realm_id = ?').run(
    companyName,
    companyStartDate,
    new Date().toISOString(),
    realmId,
  );
}

/** Persist rotated tokens. Called on every refresh — rotation makes this mandatory. */
export function saveTokens(realmId: string, tokens: TokenSet): void {
  db.prepare(
    `UPDATE connections SET
       access_token = @accessToken,
       refresh_token = @refreshToken,
       access_token_expires_at = @accessTokenExpiresAt,
       refresh_token_expires_at = @refreshTokenExpiresAt,
       status = 'ok',
       updated_at = @now
     WHERE realm_id = @realmId`,
  ).run({ ...tokens, realmId, now: new Date().toISOString() });
}

export function markNeedsReauth(realmId: string): void {
  db.prepare(`UPDATE connections SET status = 'needs_reauth', updated_at = ? WHERE realm_id = ?`).run(
    new Date().toISOString(),
    realmId,
  );
}

export function setSyncStartDate(realmId: string, syncStartDate: string | null): void {
  db.prepare('UPDATE connections SET sync_start_date = ?, updated_at = ? WHERE realm_id = ?').run(
    syncStartDate,
    new Date().toISOString(),
    realmId,
  );
}

export function setAccountingMethod(realmId: string, method: AccountingMethod): void {
  db.prepare('UPDATE connections SET accounting_method = ?, updated_at = ? WHERE realm_id = ?').run(
    method,
    new Date().toISOString(),
    realmId,
  );
}

export function setClosedThrough(realmId: string, closedThrough: string | null): void {
  db.prepare('UPDATE connections SET closed_through = ?, updated_at = ? WHERE realm_id = ?').run(
    closedThrough,
    new Date().toISOString(),
    realmId,
  );
}

// ---- Users ------------------------------------------------------------

export type UserRole = 'admin' | 'advisor' | 'client';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface UserCompany {
  realm_id: string;
  company_name: string;
}

function companiesFor(userId: number): UserCompany[] {
  return db
    .prepare(
      `SELECT uc.realm_id, c.company_name FROM user_companies uc
       JOIN connections c ON c.realm_id = uc.realm_id
       WHERE uc.user_id = ? ORDER BY c.company_name COLLATE NOCASE`,
    )
    .all(userId) as UserCompany[];
}

export function listUsers(): (UserRow & { companies: UserCompany[] })[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY role, name COLLATE NOCASE').all() as UserRow[];
  return rows.map((u) => ({ ...u, companies: companiesFor(u.id) }));
}

export function getUser(id: number): (UserRow & { companies: UserCompany[] }) | undefined {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? { ...row, companies: companiesFor(row.id) } : undefined;
}

const setCompanies = db.transaction((userId: number, realmIds: string[]) => {
  db.prepare('DELETE FROM user_companies WHERE user_id = ?').run(userId);
  const insert = db.prepare('INSERT INTO user_companies (user_id, realm_id) VALUES (?, ?)');
  for (const realmId of realmIds) insert.run(userId, realmId);
});

export function createUser(args: {
  email: string;
  name: string;
  role: UserRole;
  realmIds: string[];
}): UserRow & { companies: UserCompany[] } {
  const result = db
    .prepare('INSERT INTO users (email, name, role, created_at) VALUES (?, ?, ?, ?)')
    .run(args.email, args.name, args.role, new Date().toISOString());
  const id = Number(result.lastInsertRowid);
  setCompanies(id, args.realmIds);
  return getUser(id)!;
}

export function updateUser(
  id: number,
  fields: { name?: string; role?: UserRole; realmIds?: string[] },
): UserRow & { companies: UserCompany[] } {
  const current = getUser(id);
  if (!current) throw new Error(`No user ${id}`);
  db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').run(
    fields.name ?? current.name,
    fields.role ?? current.role,
    id,
  );
  if (fields.realmIds !== undefined) setCompanies(id, fields.realmIds);
  return getUser(id)!;
}

export function deleteUser(id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function deleteConnection(realmId: string): void {
  db.prepare('DELETE FROM connections WHERE realm_id = ?').run(realmId);
}

export function getDataset(realmId: string): DatasetRow | undefined {
  return db.prepare('SELECT * FROM datasets WHERE realm_id = ?').get(realmId) as DatasetRow | undefined;
}

export function upsertDataset(args: {
  realmId: string;
  entries: LedgerEntry[];
  accountMap: AccountMap;
  openingBalances: Record<string, number>;
  vendors: VendorProfile[];
  startDate: string;
  endDate: string;
  notes: string[];
}): string {
  const lastSyncedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO datasets (realm_id, entries_json, account_map_json, opening_balances_json, vendors_json, start_date, end_date, notes_json, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(realm_id) DO UPDATE SET
       entries_json = excluded.entries_json,
       account_map_json = excluded.account_map_json,
       opening_balances_json = excluded.opening_balances_json,
       vendors_json = excluded.vendors_json,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       notes_json = excluded.notes_json,
       last_synced_at = excluded.last_synced_at`,
  ).run(
    args.realmId,
    JSON.stringify(args.entries),
    JSON.stringify(args.accountMap),
    JSON.stringify(args.openingBalances),
    JSON.stringify(args.vendors),
    args.startDate,
    args.endDate,
    JSON.stringify(args.notes),
    lastSyncedAt,
  );
  return lastSyncedAt;
}

export function saveAccountMap(realmId: string, accountMap: AccountMap): void {
  db.prepare('UPDATE datasets SET account_map_json = ? WHERE realm_id = ?').run(JSON.stringify(accountMap), realmId);
}

export function startSyncLog(realmId: string): number {
  const result = db
    .prepare(`INSERT INTO sync_log (realm_id, started_at, status) VALUES (?, ?, 'running')`)
    .run(realmId, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function finishSyncLog(id: number, status: 'success' | 'error', entryCount: number | null, message: string | null): void {
  db.prepare('UPDATE sync_log SET finished_at = ?, status = ?, entry_count = ?, message = ? WHERE id = ?').run(
    new Date().toISOString(),
    status,
    entryCount,
    message,
    id,
  );
}

export function listSyncLog(realmId: string, limit: number): SyncLogRow[] {
  return db
    .prepare('SELECT * FROM sync_log WHERE realm_id = ? ORDER BY id DESC LIMIT ?')
    .all(realmId, limit) as SyncLogRow[];
}
