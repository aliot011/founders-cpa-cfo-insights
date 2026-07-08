import type { AccountMap, Category, LedgerEntry, VendorProfile } from '../types.ts';
import { computeCategorySigns } from './metrics.ts';
import { shiftMonth } from './format.ts';

/** Months of ledger activity (ending at the review month) that make a vendor relevant. */
const WINDOW = 12;

/** Accounts whose lines count as vendor spend. */
const SPEND_CATS = new Set<Category>(['cogs', 'opex', 'other_expense']);

export interface Vendor1099Row {
  vendor: VendorProfile;
  /** Spend over the window (natural magnitude). */
  spend: number;
  /** Date of the vendor's latest expense line in the window. */
  lastPaid: string;
}

export interface Vendor1099Report {
  /** 1099-tracked vendors missing the tax ID, address, or email needed to file / chase a W-9. */
  incomplete: Vendor1099Row[];
  /** Untracked vendors whose first-ever spend is in the review month: collect the W-9 now. */
  newUntracked: Vendor1099Row[];
  /** Established vendors with spend in the window that aren't 1099-tracked (corps are legitimately here). */
  untracked: Vendor1099Row[];
}

/**
 * 1099/W-9 readiness over the vendors that actually matter: those with
 * expense activity in the trailing year through the review month. The API
 * reports tax-ID presence (masked), the 1099-tracking flag, and contact
 * fields, which is everything a W-9 chase needs.
 */
export function build1099Readiness(
  entries: LedgerEntry[],
  accountMap: AccountMap,
  vendors: VendorProfile[],
  reviewMonth: string,
): Vendor1099Report {
  const windowStart = shiftMonth(reviewMonth, -(WINDOW - 1));
  const mult = computeCategorySigns(entries, accountMap);

  const activity = new Map<string, { spend: number; lastPaid: string }>();
  // First spend month per payee over the whole synced ledger, so "new this
  // month" means no expense activity in any earlier month.
  const firstSpend = new Map<string, string>();
  for (const e of entries) {
    const cat = accountMap[e.account] ?? 'ignore';
    if (!SPEND_CATS.has(cat)) continue;
    const payee = e.vendor || e.name;
    if (!payee) continue;
    const first = firstSpend.get(payee);
    if (!first || e.month < first) firstSpend.set(payee, e.month);
    if (e.month < windowStart || e.month > reviewMonth) continue;
    const a = activity.get(payee) ?? { spend: 0, lastPaid: e.date };
    a.spend += e.amount * mult[cat];
    if (e.date > a.lastPaid) a.lastPaid = e.date;
    activity.set(payee, a);
  }

  const incomplete: Vendor1099Row[] = [];
  const newUntracked: Vendor1099Row[] = [];
  const untracked: Vendor1099Row[] = [];
  for (const vendor of vendors) {
    const a = activity.get(vendor.name);
    if (!a) continue; // no spend in the window; not this year's problem
    const row = { vendor, spend: a.spend, lastPaid: a.lastPaid };
    if (vendor.tracked1099 && (!vendor.hasTaxId || !vendor.hasAddress || !vendor.hasEmail)) {
      incomplete.push(row);
    } else if (!vendor.tracked1099) {
      if (firstSpend.get(vendor.name) === reviewMonth) newUntracked.push(row);
      else untracked.push(row);
    }
  }

  const bySpend = (a: Vendor1099Row, b: Vendor1099Row) =>
    b.spend - a.spend || a.vendor.name.localeCompare(b.vendor.name);
  return {
    incomplete: incomplete.sort(bySpend),
    newUntracked: newUntracked.sort(bySpend),
    untracked: untracked.sort(bySpend),
  };
}
