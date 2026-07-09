import { Router, type Request } from 'express';
import type { AccountingMethod, AccountMap } from '../../../src/types.ts';
import {
  deleteConnection,
  getConnection,
  getDataset,
  listConnections,
  listSyncLog,
  saveAccountMap,
  setAccountingMethod,
  setClosedThrough,
  setSyncStartDate,
} from '../db.ts';
import { requireRole } from '../auth.ts';
import { getUserCompanyRealms } from '../db.ts';
import { env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { revoke } from '../qbo/oauth.ts';
import { runSync } from '../sync.ts';

/** Client users only see their scoped companies; other roles see all. */
function allowedRealms(req: Request): Set<string> | null {
  return req.user!.role === 'client' ? getUserCompanyRealms(req.user!.id) : null;
}

function requireCompanyAccess(req: Request, realmId: string): void {
  const allowed = allowedRealms(req);
  if (allowed && !allowed.has(realmId)) {
    throw new ApiError(403, 'Not allowed.', 'forbidden');
  }
}

/** Advisors and admins only (mutating / operational routes). */
const advisorOnly = requireRole('admin', 'advisor');

export const clientsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireConnection(realmId: string) {
  const conn = getConnection(realmId);
  if (!conn) throw new ApiError(404, `No QuickBooks connection for realm ${realmId}`, 'not_found');
  return conn;
}

clientsRouter.get('/', (req, res) => {
  const allowed = allowedRealms(req);
  res.json(
    listConnections()
      .filter((c) => !allowed || allowed.has(c.realm_id))
      .map((c) => ({
      realmId: c.realm_id,
      companyName: c.company_name,
      status: c.status,
      connectedAt: c.connected_at,
      lastSyncedAt: getDataset(c.realm_id)?.last_synced_at ?? null,
      syncStartDate: c.sync_start_date,
      companyStartDate: c.company_start_date,
      accountingMethod: c.accounting_method,
      closedThrough: c.closed_through,
      })),
  );
});

clientsRouter.post('/:realmId/sync', advisorOnly, async (req, res, next) => {
  try {
    const realmId = String(req.params.realmId);
    const { startDate, endDate } = (req.body ?? {}) as { startDate?: string; endDate?: string };
    for (const [label, value] of [['startDate', startDate], ['endDate', endDate]] as const) {
      if (value !== undefined && !DATE_RE.test(value)) {
        throw new ApiError(400, `${label} must be YYYY-MM-DD.`, 'bad_request');
      }
    }
    res.json(await runSync(realmId, { startDate, endDate }));
  } catch (err) {
    next(err);
  }
});

clientsRouter.get('/:realmId/dataset', (req, res) => {
  requireCompanyAccess(req, req.params.realmId);
  const conn = requireConnection(req.params.realmId);
  const ds = getDataset(req.params.realmId);
  if (!ds) throw new ApiError(404, `${conn.company_name} has not been synced yet.`, 'not_found');
  res.json({
    entries: JSON.parse(ds.entries_json),
    accountMap: JSON.parse(ds.account_map_json),
    openingBalances: JSON.parse(ds.opening_balances_json || '{}'),
    vendors: JSON.parse(ds.vendors_json || '[]'),
    startDate: ds.start_date,
    endDate: ds.end_date,
    notes: JSON.parse(ds.notes_json),
    lastSyncedAt: ds.last_synced_at,
    companyName: conn.company_name,
    qboEnvironment: env.QBO_ENVIRONMENT,
  });
});

clientsRouter.put('/:realmId/account-map', advisorOnly, (req, res) => {
  const realmId = String(req.params.realmId);
  requireConnection(realmId);
  const { accountMap } = (req.body ?? {}) as { accountMap?: AccountMap };
  if (!accountMap || typeof accountMap !== 'object') {
    throw new ApiError(400, 'Body must include an accountMap object.', 'bad_request');
  }
  if (!getDataset(realmId)) {
    throw new ApiError(404, 'Sync this client before editing its account map.', 'not_found');
  }
  saveAccountMap(realmId, accountMap);
  res.json({ ok: true });
});

clientsRouter.get('/:realmId/sync-log', advisorOnly, (req, res) => {
  const realmId = String(req.params.realmId);
  requireConnection(realmId);
  const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
  res.json(
    listSyncLog(realmId, limit).map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      entryCount: row.entry_count,
      message: row.message,
    })),
  );
});

const MONTH_RE = /^\d{4}-\d{2}$/;

clientsRouter.put('/:realmId/settings', advisorOnly, (req, res) => {
  const realmId = String(req.params.realmId);
  requireConnection(realmId);
  const body = (req.body ?? {}) as {
    syncStartDate?: string | null;
    accountingMethod?: AccountingMethod;
    closedThrough?: string | null;
  };
  if ('syncStartDate' in body) {
    if (body.syncStartDate != null && !DATE_RE.test(body.syncStartDate)) {
      throw new ApiError(400, 'syncStartDate must be YYYY-MM-DD or null.', 'bad_request');
    }
    setSyncStartDate(realmId, body.syncStartDate ?? null);
  }
  if ('accountingMethod' in body) {
    if (body.accountingMethod !== 'Accrual' && body.accountingMethod !== 'Cash') {
      throw new ApiError(400, "accountingMethod must be 'Accrual' or 'Cash'.", 'bad_request');
    }
    setAccountingMethod(realmId, body.accountingMethod);
  }
  if ('closedThrough' in body) {
    if (body.closedThrough != null && !MONTH_RE.test(body.closedThrough)) {
      throw new ApiError(400, 'closedThrough must be YYYY-MM or null.', 'bad_request');
    }
    setClosedThrough(realmId, body.closedThrough ?? null);
  }
  res.json({ ok: true });
});

clientsRouter.delete('/:realmId', requireRole('admin'), async (req, res) => {
  const realmId = String(req.params.realmId);
  const conn = requireConnection(realmId);
  await revoke(conn.refresh_token);
  deleteConnection(realmId); // cascades to datasets; sync_log kept
  res.json({ ok: true });
});
