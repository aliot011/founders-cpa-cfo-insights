import type { AccountMap, Category, LedgerEntry, MonthlyMetrics } from '../types';

/**
 * Turn normalized ledger entries + an account->category map into a sorted
 * series of monthly metrics.
 *
 * Sign handling: entries are stored debit-positive, but QuickBooks single
 * "Amount" exports don't always follow that convention for income accounts.
 * We auto-detect a per-category multiplier so that P&L magnitudes come out
 * positive (revenue and expenses are, in aggregate, positive numbers), then
 * apply standard P&L arithmetic on those magnitudes.
 */
export function computeMetrics(entries: LedgerEntry[], accountMap: AccountMap): MonthlyMetrics[] {
  // Grand totals per category, for sign detection.
  const grand: Record<Category, number> = {
    revenue: 0, cogs: 0, opex: 0, other_income: 0, other_expense: 0, cash: 0, ignore: 0,
  };
  for (const e of entries) {
    const cat = accountMap[e.account] ?? 'ignore';
    grand[cat] += e.amount;
  }

  const sign = (cat: Category): number => (grand[cat] < 0 ? -1 : 1);
  // P&L categories we normalize to positive magnitudes.
  const mult: Record<Category, number> = {
    revenue: sign('revenue'),
    cogs: sign('cogs'),
    opex: sign('opex'),
    other_income: sign('other_income'),
    other_expense: sign('other_expense'),
    cash: 1, // balances stay debit-positive
    ignore: 1,
  };

  // Bucket sums per month.
  const byMonth = new Map<string, Record<Category, number>>();
  for (const e of entries) {
    const cat = accountMap[e.account] ?? 'ignore';
    let bucket = byMonth.get(e.month);
    if (!bucket) {
      bucket = { revenue: 0, cogs: 0, opex: 0, other_income: 0, other_expense: 0, cash: 0, ignore: 0 };
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
