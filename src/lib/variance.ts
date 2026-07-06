import {
  BS_CATEGORIES,
  PNL_CATEGORIES,
  type AccountMap,
  type Category,
  type LedgerEntry,
} from '../types';
import { computeCategorySigns } from './metrics';

/** An inclusive month range, e.g. { start: '2026-01', end: '2026-03' }. */
export interface Period {
  start: string;
  end: string;
}

export interface AccountVariance {
  account: string;
  category: Category;
  p1: number;
  p2: number;
  change: number;
  pctChange: number | null;
  /** Only set for balance-sheet rows. Indirect-method effect on cash. */
  cashImpact: number | null;
}

/** A single P&L totals line. `change`/`pctChange` semantics depend on `format`. */
export interface PnlLine {
  key: string;
  label: string;
  format: 'currency' | 'percent';
  p1: number;
  p2: number;
  /** currency: p2 − p1 dollars. percent: point change (p2 − p1 as a fraction). */
  change: number;
  /** relative change vs p1, or null when p1 is 0/undefined. */
  pctChange: number | null;
  /** emphasised total lines (Gross Profit / Operating Income / Net Income). */
  emphasis?: boolean;
  /** margin lines shown as muted sub-rows. */
  sub?: boolean;
}

export interface VarianceReport {
  pnlLines: PnlLine[];
  bsRows: AccountVariance[];
  /** Sum of cash impact across non-cash balance-sheet accounts. */
  bsCashImpactTotal: number;
  /** Actual change in cash balance between the two periods. */
  cashActualChange: number;
  /** Net Income for period 2, for the cash-flow bridge caption. */
  netIncomeP2: number;
}

function pct(change: number, p1: number): number | null {
  return p1 === 0 ? null : change / Math.abs(p1);
}

function currencyLine(
  key: string,
  label: string,
  p1: number,
  p2: number,
  opts: { emphasis?: boolean } = {},
): PnlLine {
  const change = p2 - p1;
  return { key, label, format: 'currency', p1, p2, change, pctChange: pct(change, p1), ...opts };
}

function marginLine(key: string, label: string, num1: number, num2: number, rev1: number, rev2: number): PnlLine {
  const m1 = rev1 !== 0 ? num1 / rev1 : NaN;
  const m2 = rev2 !== 0 ? num2 / rev2 : NaN;
  const change = isFinite(m1) && isFinite(m2) ? m2 - m1 : NaN;
  const pctChange = isFinite(m1) && m1 !== 0 && isFinite(change) ? change / Math.abs(m1) : null;
  return { key, label, format: 'percent', p1: m1, p2: m2, change, pctChange, sub: true };
}

/**
 * Build the two-period variance report.
 *
 * P&L is summarised to totals-only line items. P&L accounts are flows (summed
 * within each period's month range); balance-sheet accounts are stocks (ending
 * balance as of each period's end month, cumulative within the loaded ledger).
 * The absolute cumulative offset cancels in the subtraction, so $ change and
 * cash impact are exact even when the export omits opening balances.
 */
export function computeVariance(
  entries: LedgerEntry[],
  accountMap: AccountMap,
  p1: Period,
  p2: Period,
): VarianceReport {
  const mult = computeCategorySigns(entries, accountMap);

  // account -> month -> summed (debit-positive) amount
  const perAccount = new Map<string, Map<string, number>>();
  for (const e of entries) {
    let m = perAccount.get(e.account);
    if (!m) {
      m = new Map();
      perAccount.set(e.account, m);
    }
    m.set(e.month, (m.get(e.month) ?? 0) + e.amount);
  }

  const flow = (months: Map<string, number>, period: Period, sign: number): number => {
    let sum = 0;
    for (const [month, v] of months) if (month >= period.start && month <= period.end) sum += v;
    return sum * sign;
  };
  const stock = (months: Map<string, number>, period: Period, sign: number): number => {
    let sum = 0;
    for (const [month, v] of months) if (month <= period.end) sum += v;
    return sum * sign;
  };

  // Category period subtotals for P&L.
  const sub = {} as Record<Category, { p1: number; p2: number }>;
  for (const c of PNL_CATEGORIES) sub[c] = { p1: 0, p2: 0 };
  const bsRows: AccountVariance[] = [];

  for (const [account, months] of perAccount) {
    const category = accountMap[account] ?? 'ignore';
    const sign = mult[category];

    if (PNL_CATEGORIES.includes(category)) {
      sub[category].p1 += flow(months, p1, sign);
      sub[category].p2 += flow(months, p2, sign);
    } else if (BS_CATEGORIES.includes(category)) {
      const v1 = stock(months, p1, sign);
      const v2 = stock(months, p2, sign);
      if (v1 === 0 && v2 === 0) continue;
      const change = v2 - v1;
      const cashImpact = category === 'asset' ? -change : change;
      bsRows.push({ account, category, p1: v1, p2: v2, change, pctChange: pct(change, v1), cashImpact });
    }
  }

  // --- Totals-only P&L lines --------------------------------------------
  const rev1 = sub.revenue.p1, rev2 = sub.revenue.p2;
  const gp1 = rev1 - sub.cogs.p1, gp2 = rev2 - sub.cogs.p2;
  const oi1 = gp1 - sub.opex.p1, oi2 = gp2 - sub.opex.p2;
  const oioe1 = sub.other_income.p1 - sub.other_expense.p1;
  const oioe2 = sub.other_income.p2 - sub.other_expense.p2;
  const ni1 = oi1 + oioe1, ni2 = oi2 + oioe2;

  const pnlLines: PnlLine[] = [
    currencyLine('revenue', 'Total Revenue', rev1, rev2),
    currencyLine('cogs', 'COGS', sub.cogs.p1, sub.cogs.p2),
    currencyLine('grossProfit', 'Gross Profit', gp1, gp2, { emphasis: true }),
    marginLine('grossMargin', 'Gross Margin', gp1, gp2, rev1, rev2),
    currencyLine('opex', 'OpEx', sub.opex.p1, sub.opex.p2),
    currencyLine('operatingIncome', 'Operating Income', oi1, oi2, { emphasis: true }),
    marginLine('operatingMargin', 'Operating Income Margin', oi1, oi2, rev1, rev2),
    currencyLine('oioe', 'OI/OE', oioe1, oioe2),
    currencyLine('netIncome', 'Net Income', ni1, ni2, { emphasis: true }),
    marginLine('netIncomeMargin', 'Net Income Margin', ni1, ni2, rev1, rev2),
  ];

  // --- Balance-sheet ordering + totals ----------------------------------
  const catOrder: Record<Category, number> = { cash: 0, asset: 1, liability_equity: 2 } as Record<Category, number>;
  bsRows.sort((a, b) => {
    const c = (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9);
    return c !== 0 ? c : Math.abs(b.change) - Math.abs(a.change);
  });

  const cashActualChange = bsRows.filter((r) => r.category === 'cash').reduce((t, r) => t + r.change, 0);
  const bsCashImpactTotal = bsRows.filter((r) => r.category !== 'cash').reduce((t, r) => t + (r.cashImpact ?? 0), 0);

  return { pnlLines, bsRows, bsCashImpactTotal, cashActualChange, netIncomeP2: ni2 };
}
