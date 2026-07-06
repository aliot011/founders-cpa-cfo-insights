export function formatCurrency(n: number, compact = false): string {
  if (!isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(n);
}

export function formatPercent(fraction: number, digits = 1): string {
  if (!isFinite(fraction)) return '—';
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
