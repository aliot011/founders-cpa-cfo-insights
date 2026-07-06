import { ALL_CATEGORIES, type AccountMap, type Category, type LedgerEntry, type MonthlyMetrics } from '../types';

/** A zeroed record with every category as a key. */
export function zeroByCategory(): Record<Category, number> {
  const rec = {} as Record<Category, number>;
  for (const cat of ALL_CATEGORIES) rec[cat] = 0;
  return rec;
}

/**
 * Per-category display multiplier (+1 or −1).
 *
 * Entries are stored debit-positive, but QuickBooks single "Amount" exports
 * don't always follow that convention. We flip each category so its aggregate
 * comes out as a positive, natural magnitude: revenue/expenses positive, assets
 * positive, liabilities/equity shown as positive (credit) balances. This makes
 * both P&L arithmetic and the balance-sheet variance / cash-impact signs work
 * regardless of the export's sign convention.
 *
 * Cash is pinned to +1 so a genuinely overdrawn balance is not flipped.
 */
export function computeCategorySigns(entries: LedgerEntry[], accountMap: AccountMap): Record<Category, number> {
  const grand = zeroByCategory();
  for (const e of entries) grand[accountMap[e.account] ?? 'ignore'] += e.amount;

  const mult = {} as Record<Category, number>;
  for (const cat of ALL_CATEGORIES) mult[cat] = grand[cat] < 0 ? -1 : 1;
  mult.cash = 1;
  mult.ignore = 1;
  return mult;
}

/**
 * Turn normalized ledger entries + an account->category map into a sorted
 * series of monthly metrics.
 */
export function computeMetrics(entries: LedgerEntry[], accountMap: AccountMap): MonthlyMetrics[] {
  const mult = computeCategorySigns(entries, accountMap);

  // Bucket sums per month.
  const byMonth = new Map<string, Record<Category, number>>();
  for (const e of entries) {
    const cat = accountMap[e.account] ?? 'ignore';
    let bucket = byMonth.get(e.month);
    if (!bucket) {
      bucket = zeroByCategory();
      byMonth.set(e.month, bucket);
    }
    bucket[cat] += e.amount;
  }

  const months = [...byMonth.keys()].sort();
  let cashBalance = 0; // running, debit-positive
  const out: MonthlyMetrics[] = [];

  for (const month of months) {
    const b = byMonth.get(month)!;
    const revenue = b.revenue * mult.revenue;
    const cogs = b.cogs * mult.cogs;
    const opex = b.opex * mult.opex;
    const otherIncome = b.other_income * mult.other_income;
    const otherExpense = b.other_expense * mult.other_expense;

    const grossProfit = revenue - cogs;
    const operatingProfit = grossProfit - opex;
    const otherNet = otherIncome - otherExpense;
    const netIncome = operatingProfit + otherNet;

    cashBalance += b.cash * mult.cash;

    out.push({
      month,
      revenue,
      cogs,
      grossProfit,
      grossMargin: revenue !== 0 ? grossProfit / revenue : NaN,
      opex,
      operatingProfit,
      operatingMargin: revenue !== 0 ? operatingProfit / revenue : NaN,
      otherIncome,
      otherExpense,
      otherNet,
      netIncome,
      netIncomeMargin: revenue !== 0 ? netIncome / revenue : NaN,
      cash: cashBalance,
    });
  }

  return out;
}
