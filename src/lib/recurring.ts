import type { AccountMap, Category, LedgerEntry } from '../types.ts';
import { computeCategorySigns } from './metrics.ts';
import { shiftMonth } from './format.ts';

/** How many months before the target we examine. */
const WINDOW = 6;
/** A vendor must appear in at least this many consecutive months (ending right before the target) to count as recurring. */
const MIN_STREAK = 3;
/** Coefficient of variation below which monthly spend reads as "steady". */
const STEADY_CV = 0.25;

/** Accounts whose lines count as vendor spend. */
const SPEND_CATS = new Set<Category>(['cogs', 'opex', 'other_expense']);

export interface RecurringMiss {
  vendor: string;
  /** Consecutive months with activity, ending the month before the target. */
  streak: number;
  /** Average monthly spend across the streak (natural magnitude). */
  avgAmount: number;
  /** True when monthly spend varies less than STEADY_CV. */
  steady: boolean;
  minAmount: number;
  maxAmount: number;
  /** Average transactions per month across the streak. */
  avgTxns: number;
  /** Accounts the vendor's spend usually hits. */
  accounts: string[];
  /** Date of the vendor's most recent transaction anywhere in the ledger. */
  lastSeen: string;
  /** That transaction's QBO id/type, for deep-linking. */
  lastSeenTxnId?: string;
  lastSeenType?: string;
}

/**
 * Vendors with a consecutive-month spend streak running right up to the month
 * before `targetMonth`, but zero transactions in `targetMonth` itself — the
 * "monthly contractor JE that didn't happen this month" detector.
 *
 * Works over the full (uncapped) ledger; lines without a vendor/payee are
 * invisible here (the missing-vendor check owns those).
 */
export function findMissingRecurringVendors(
  entries: LedgerEntry[],
  accountMap: AccountMap,
  targetMonth: string,
): RecurringMiss[] {
  const mult = computeCategorySigns(entries, accountMap);

  interface VendorMonth {
    amount: number;
    txns: number;
  }
  const byVendor = new Map<
    string,
    { months: Map<string, VendorMonth>; accounts: Set<string>; lastSeenEntry: LedgerEntry }
  >();

  for (const e of entries) {
    const cat = accountMap[e.account] ?? 'ignore';
    if (!SPEND_CATS.has(cat)) continue;
    const vendor = e.vendor || e.name;
    if (!vendor) continue;

    let v = byVendor.get(vendor);
    if (!v) {
      v = { months: new Map(), accounts: new Set(), lastSeenEntry: e };
      byVendor.set(vendor, v);
    }
    const m = v.months.get(e.month) ?? { amount: 0, txns: 0 };
    m.amount += e.amount * mult[cat];
    m.txns += 1;
    v.months.set(e.month, m);
    v.accounts.add(e.account);
    if (e.date > v.lastSeenEntry.date) v.lastSeenEntry = e;
  }

  const misses: RecurringMiss[] = [];

  for (const [vendor, v] of byVendor) {
    if (v.months.has(targetMonth)) continue; // present — nothing to flag

    // Walk backwards from the month before the target while activity continues.
    const streakMonths: VendorMonth[] = [];
    for (let i = 1; i <= WINDOW; i++) {
      const m = v.months.get(shiftMonth(targetMonth, -i));
      if (!m) break;
      streakMonths.push(m);
    }
    if (streakMonths.length < MIN_STREAK) continue;

    const amounts = streakMonths.map((m) => m.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((t, a) => t + (a - mean) ** 2, 0) / amounts.length;
    const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : Infinity;

    misses.push({
      vendor,
      streak: streakMonths.length,
      avgAmount: mean,
      steady: cv <= STEADY_CV,
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      avgTxns: streakMonths.reduce((t, m) => t + m.txns, 0) / streakMonths.length,
      accounts: [...v.accounts].sort((a, b) => a.localeCompare(b)),
      lastSeen: v.lastSeenEntry.date,
      lastSeenTxnId: v.lastSeenEntry.txnId,
      lastSeenType: v.lastSeenEntry.transactionType,
    });
  }

  // Highest-confidence first: steady spend, then size.
  return misses.sort(
    (a, b) => Number(b.steady) - Number(a.steady) || b.avgAmount - a.avgAmount || a.vendor.localeCompare(b.vendor),
  );
}
