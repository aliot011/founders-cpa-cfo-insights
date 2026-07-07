export function formatCurrency(n: number, compact = false): string {
  if (!isFinite(n)) return 'n/a';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(n);
}

/** Currency with cents, for transaction-level detail rows. */
export function formatCurrencyExact(n: number): string {
  if (!isFinite(n)) return 'n/a';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function formatPercent(fraction: number, digits = 1): string {
  if (!isFinite(fraction)) return 'n/a';
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Month key (YYYY-MM) -> "Jan 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function formatMonthShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/** Period granularity used by the pivot-style tables. */
export type Granularity = 'month' | 'quarter' | 'year';

/** Bucket a YYYY-MM month key by granularity into a stable key + display label. */
export function bucketMonth(month: string, gran: Granularity): { key: string; label: string } {
  const [y, m] = month.split('-').map(Number);
  const yy = `'${String(y).slice(2)}`;
  if (gran === 'month') return { key: month, label: formatMonthShort(month) };
  if (gran === 'quarter') {
    const q = Math.floor((m - 1) / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${yy}` };
  }
  return { key: `${y}`, label: `${y}` };
}

/** Shift a YYYY-MM month key by a number of months (can be negative). */
export function shiftMonth(month: string, deltaMonths: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Month-over-month change between two numbers. */
export interface Delta {
  abs: number;
  /** fraction, or null when prior is 0/undefined. */
  pct: number | null;
}

export function computeDelta(current: number, prior: number | undefined): Delta {
  if (prior === undefined) return { abs: NaN, pct: null };
  const abs = current - prior;
  const pct = prior === 0 ? null : abs / Math.abs(prior);
  return { abs, pct };
}
