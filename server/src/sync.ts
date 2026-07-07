import type { AccountMap } from '../../src/types.ts';
import {
  finishSyncLog,
  getConnection,
  getDataset,
  startSyncLog,
  upsertDataset,
} from './db.ts';
import { ApiError } from './errors.ts';
import { buildQboAccountMap, fetchAllAccounts } from './qbo/accounts.ts';
import { fetchGeneralLedger } from './qbo/generalLedger.ts';
import { guessCategory } from '../../src/lib/classify.ts';

// One sync at a time per realm; concurrent requests get a 409.
const running = new Set<string>();

export interface SyncResult {
  lastSyncedAt: string;
  entryCount: number;
  accountCount: number;
  notes: string[];
}

/**
 * Merge freshly classified QBO accounts into the saved map without ever
 * overwriting an existing key — the user's manual overrides must survive
 * every re-sync. Returns the names that were newly added.
 */
export function mergeAccountMap(existing: AccountMap, fromQbo: AccountMap): { map: AccountMap; added: string[] } {
  const map: AccountMap = { ...existing };
  const added: string[] = [];
  for (const [account, category] of Object.entries(fromQbo)) {
    if (!(account in map)) {
      map[account] = category;
      added.push(account);
    }
  }
  return { map, added };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runSync(
  realmId: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<SyncResult> {
  const conn = getConnection(realmId);
  if (!conn) throw new ApiError(404, `No QuickBooks connection for realm ${realmId}`, 'not_found');
  if (running.has(realmId)) {
    throw new ApiError(409, `A sync is already running for ${conn.company_name}.`, 'sync_in_progress');
  }
  running.add(realmId);
  const logId = startSyncLog(realmId);
  try {
    // Default to full company history: cash is a running sum from the first
    // entry, so a truncated range silently misstates it.
    const startDate = opts.startDate ?? conn.sync_start_date ?? conn.company_start_date ?? '2000-01-01';
    const endDate = opts.endDate ?? today();
    if (startDate >= endDate) {
      throw new ApiError(400, `Start date ${startDate} must be before end date ${endDate}.`, 'bad_request');
    }

    const notes: string[] = [];
    const qboAccounts = await fetchAllAccounts(realmId);
    const { entries, skipped } = await fetchGeneralLedger(realmId, startDate, endDate);

    // Classify: saved map first, QBO account types for new names, heuristics
    // for report labels that match no Account entity (e.g. renamed accounts).
    const existing = ((): AccountMap => {
      const ds = getDataset(realmId);
      return ds ? (JSON.parse(ds.account_map_json) as AccountMap) : {};
    })();
    const { map, added } = mergeAccountMap(existing, buildQboAccountMap(qboAccounts));
    for (const e of entries) {
      if (!(e.account in map)) {
        map[e.account] = guessCategory(e.account);
        added.push(e.account);
      }
    }

    notes.push(
      `Synced ${entries.length.toLocaleString()} transactions across ${new Set(entries.map((e) => e.account)).size} accounts (${startDate} → ${endDate}).`,
    );
    if (added.length > 0) {
      notes.push(`Auto-categorized ${added.length} new account(s) — review them in the Accounts tab.`);
    }
    if (skipped > 0) notes.push(`Skipped ${skipped} non-transaction row(s) (beginning balances etc.).`);

    const lastSyncedAt = upsertDataset({ realmId, entries, accountMap: map, startDate, endDate, notes });
    finishSyncLog(logId, 'success', entries.length, notes.join(' '));
    return { lastSyncedAt, entryCount: entries.length, accountCount: Object.keys(map).length, notes };
  } catch (err) {
    finishSyncLog(logId, 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    running.delete(realmId);
  }
}
