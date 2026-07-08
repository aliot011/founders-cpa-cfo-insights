import type { AccountMap, Category, LedgerEntry } from '../types.ts';
import { computeCategorySigns } from './metrics.ts';
import { shiftMonth } from './format.ts';

/** How many months (ending at the review month) the breakdown covers. */
const WINDOW = 6;

/** Accounts whose lines count as vendor spend. */
const SPEND_CATS = new Set<Category>(['cogs', 'opex', 'other_expense']);

export interface MultiAccountVendor {
  vendor: string;
  /** The window months, ascending (columns of the per-vendor table). */
  months: string[];
  rows: { account: string; byMonth: Record<string, number>; total: number }[];
  total: number;
}

/**
 * Vendors whose spend hits more than one expense account within the trailing
 * window, worth a look for inconsistent coding (the same vendor booked to
 * different G/L accounts in different months), though multi-account vendors
 * can be legitimate.
 */
export function findMultiAccountVendors(
  entries: LedgerEntry[],
  accountMap: AccountMap,
  endMonth: string,
  window = WINDOW,
): MultiAccountVendor[] {
  const months: string[] = [];
  for (let i = window - 1; i >= 0; i--) months.push(shiftMonth(endMonth, -i));
  const monthSet = new Set(months);

  const mult = computeCategorySigns(entries, accountMap);
  const byVendor = new Map<string, Map<string, Record<string, number>>>(); // vendor -> account -> month -> amount

  for (const e of entries) {
    const cat = accountMap[e.account] ?? 'ignore';
    if (!SPEND_CATS.has(cat) || !monthSet.has(e.month)) continue;
    const vendor = e.vendor || e.name;
    if (!vendor) continue;

    let accounts = byVendor.get(vendor);
    if (!accounts) {
      accounts = new Map();
      byVendor.set(vendor, accounts);
    }
    let byMonth = accounts.get(e.account);
    if (!byMonth) {
      byMonth = {};
      accounts.set(e.account, byMonth);
    }
    byMonth[e.month] = (byMonth[e.month] ?? 0) + e.amount * mult[cat];
  }

  const result: MultiAccountVendor[] = [];
  for (const [vendor, accounts] of byVendor) {
    if (accounts.size < 2) continue;
    const rows = [...accounts.entries()]
      .map(([account, byMonth]) => ({
        account,
        byMonth,
        total: Object.values(byMonth).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total || a.account.localeCompare(b.account));
    result.push({
      vendor,
      months,
      rows,
      total: rows.reduce((t, r) => t + r.total, 0),
    });
  }

  // Most fragmented first, then by size.
  return result.sort(
    (a, b) => b.rows.length - a.rows.length || b.total - a.total || a.vendor.localeCompare(b.vendor),
  );
}
