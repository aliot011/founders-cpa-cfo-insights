import {
  BS_CATEGORIES,
  CATEGORY_LABELS,
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

export interface Line {
  label: string;
  p1: number;
  p2: number;
  change: number;
  pctChange: number | null;
}

export interface PnlGroup {
  category: Category;
  label: string;
  rows: AccountVariance[];
  subtotal: Line;
}

export interface VarianceReport {
  pnlGroups: PnlGroup[];
  /** Gross Profit, Net Operating Profit, Net Income. */
  summaries: Record<'grossProfit' | 'operatingProfit' | 'netIncome', Line>;
  bsRows: AccountVariance[];
  /** Sum of cash impact across non-cash balance-sheet accounts. */
  bsCashImpactTotal: number;
  /** Actual change in cash balance between the two periods. */
  cashActualChange: number;
}

function pct(change: number, p1: number): number | null {
  return p1 === 0 ? null : change / Math.abs(p1);
}

function line(label: string, p1: number, p2: number): Line {
  const change = p2 - p1;
  return { label, p1, p2, change, pctChange: pct(change, p1) };
}

/**
 * Build the two-period variance report.
 *
 * P&L accounts are treated as flows: each period value is the sum of activity
 * within the period's month range. Balance-sheet accounts are treated as
 * stocks: each period value is the ending balance as of the period's end month
 * (cumulative within the loaded ledger). Because the absolute cumulative offset
 * cancels in the subtraction, the $ change and cash impact are exact even when
 * the export omits opening balances — only the balance columns themselves are
 * relative to the start of the loaded data.
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

  // Flow (P&L): sum of months within [start, end].
  const flow = (months: Map<string, number>, period: Period, sign: number): number => {
    let sum = 0;
    for (const [month, v] of months) if (month >= period.start && month <= period.end) sum += v;
    return sum * sign;
  };
  // Stock (balance sheet): cumulative sum of months on or before end.
  const stock = (months: Map<string, number>, period: Period, sign: number): number => {
    let sum = 0;
    for (const [month, v] of months) if (month <= period.end) sum += v;
    return sum * sign;
  };

  const pnlByCat = new Map<Category, AccountVariance[]>();
  for (const c of PNL_CATEGORIES) pnlByCat.set(c, []);
  const bsRows: AccountVariance[] = [];

  for (const [account, months] of perAccount) {
    const category = accountMap[account] ?? 'ignore';
    const sign = mult[category];

    if (PNL_CATEGORIES.includes(category)) {
      const v1 = flow(months, p1, sign);
      const v2 = flow(months, p2, sign);
      if (v1 === 0 && v2 === 0) continue;
      const change = v2 - v1;
      pnlByCat.get(category)!.push({
        account, category, p1: v1, p2: v2, change, pctChange: pct(change, v1), cashImpact: null,
      });
    } else if (BS_CATEGORIES.includes(category)) {
      const v1 = stock(months, p1, sign);
      const v2 = stock(months, p2, sign);
      if (v1 === 0 && v2 === 0) continue;
      const change = v2 - v1;
      // Indirect method: asset increase uses cash; liability/equity increase is a source.
      const cashImpact = category === 'asset' ? -change : change;
      bsRows.push({
        account, category, p1: v1, p2: v2, change, pctChange: pct(change, v1), cashImpact,
      });
    }
  }

  // --- P&L groups + subtotals -------------------------------------------
  const pnlGroups: PnlGroup[] = [];
  const sub: Record<Category, Line> = {} as Record<Category, Line>;
  for (const category of PNL_CATEGORIES) {
    const rows = pnlByCat.get(category)!.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const s1 = rows.reduce((t, r) => t + r.p1, 0);
    const s2 = rows.reduce((t, r) => t + r.p2, 0);
    sub[category] = line(CATEGORY_LABELS[category], s1, s2);
    if (rows.length > 0) {
      pnlGroups.push({ category, label: CATEGORY_LABELS[category], rows, subtotal: sub[category] });
    }
  }

  const gp = line(
    'Gross Profit',
    sub.revenue.p1 - sub.cogs.p1,
    sub.revenue.p2 - sub.cogs.p2,
  );
  const op = line('Net Operating Profit', gp.p1 - sub.opex.p1, gp.p2 - sub.opex.p2);
  const otherNet1 = sub.other_income.p1 - sub.other_expense.p1;
  const otherNet2 = sub.other_income.p2 - sub.other_expense.p2;
  const ni = line('Net Income', op.p1 + otherNet1, op.p2 + otherNet2);

  // --- Balance-sheet ordering + totals ----------------------------------
  const catOrder: Record<Category, number> = { cash: 0, asset: 1, liability_equity: 2 } as Record<Category, number>;
  bsRows.sort((a, b) => {
    const c = (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9);
    return c !== 0 ? c : Math.abs(b.change) - Math.abs(a.change);
  });

  const cashActualChange = bsRows
    .filter((r) => r.category === 'cash')
    .reduce((t, r) => t + r.change, 0);
  const bsCashImpactTotal = bsRows
    .filter((r) => r.category !== 'cash')
    .reduce((t, r) => t + (r.cashImpact ?? 0), 0);

  return {
    pnlGroups,
    summaries: { grossProfit: gp, operatingProfit: op, netIncome: ni },
    bsRows,
    bsCashImpactTotal,
    cashActualChange,
  };
}
