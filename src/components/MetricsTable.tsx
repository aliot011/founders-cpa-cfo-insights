import { useState } from 'react';
import { METRIC_DEFS, type MetricKey, type MonthlyMetrics } from '../types';
import { bucketMonth, formatCurrency, formatPercent, type Granularity } from '../lib/format';

interface Props {
  metrics: MonthlyMetrics[];
}

const GRAN_LABELS: Record<Granularity, string> = {
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Annual',
};

/** Subtotal / total rows that get a rule line above them. */
const RULED = new Set<MetricKey>(['grossProfit', 'operatingProfit', 'netIncome']);

/** Total rows shown in bold (including their label). */
const TOTAL_LINES = new Set<MetricKey>(['grossProfit', 'operatingProfit', 'netIncome', 'cash']);

interface Column {
  key: string;
  label: string;
  values: Record<MetricKey, number>;
  months: MonthlyMetrics[];
  /** True when the bucket has its full complement of months (3 for a quarter, 12 for a year). */
  complete: boolean;
  monthCount: number;
  expected: number;
}

/** How many columns to show per granularity (LTM for month/quarter, up to 5y for year). */
const COLUMN_LIMIT: Record<Granularity, number> = { month: 12, quarter: 4, year: 5 };

/** Months in a full bucket, used to flag partial quarters/years. */
const EXPECTED_MONTHS: Record<Granularity, number> = { month: 1, quarter: 3, year: 12 };

/** Aggregate a set of months: flows sum, margins recompute, cash = ending balance. */
function aggregate(months: MonthlyMetrics[]): Record<MetricKey, number> {
  const sum = (k: MetricKey) => months.reduce((t, m) => t + (isFinite(m[k]) ? m[k] : 0), 0);
  const revenue = sum('revenue');
  const grossProfit = sum('grossProfit');
  const operatingProfit = sum('operatingProfit');
  const netIncome = sum('netIncome');
  const margin = (n: number) => (revenue !== 0 ? n / revenue : NaN);
  return {
    revenue,
    cogs: sum('cogs'),
    grossProfit,
    grossMargin: margin(grossProfit),
    opex: sum('opex'),
    operatingProfit,
    operatingMargin: margin(operatingProfit),
    otherNet: sum('otherNet'),
    netIncome,
    netIncomeMargin: margin(netIncome),
    cash: months.length > 0 ? months[months.length - 1].cash : NaN,
  };
}

/** Group monthly metrics into columns by the chosen granularity. */
function toColumns(metrics: MonthlyMetrics[], gran: Granularity): Column[] {
  const byKey = new Map<string, { label: string; months: MonthlyMetrics[] }>();
  const order: string[] = [];
  for (const m of metrics) {
    const { key, label } = bucketMonth(m.month, gran);
    let c = byKey.get(key);
    if (!c) {
      c = { label, months: [] };
      byKey.set(key, c);
      order.push(key);
    }
    c.months.push(m);
  }
  const expected = EXPECTED_MONTHS[gran];
  return order.map((key) => {
    const c = byKey.get(key)!;
    return {
      key,
      label: c.label,
      values: aggregate(c.months),
      months: c.months,
      monthCount: c.months.length,
      expected,
      complete: c.months.length >= expected,
    };
  });
}

function windowLabel(gran: Granularity, count: number): string {
  const noun = gran === 'month' ? 'month' : gran === 'quarter' ? 'quarter' : 'year';
  return `Last ${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Full metric-by-period grid with a total column. */
export function MetricsTable({ metrics }: Props) {
  const [gran, setGran] = useState<Granularity>('month');
  // Window to the most recent columns; Total sums that same window so it reconciles.
  const columns = toColumns(metrics, gran).slice(-COLUMN_LIMIT[gran]);
  const totals = aggregate(columns.flatMap((c) => c.months));
  const partials = columns.filter((c) => !c.complete);
  const unit = gran === 'quarter' ? 'quarter' : 'year';

  return (
    <div className="panel">
      <div className="panel-head panel-head-controls">
        <div className="period-picker">
          <span className="muted" style={{ fontSize: 12 }}>{windowLabel(gran, columns.length)}</span>
          <select
            className="pp-gran"
            value={gran}
            onChange={(e) => setGran(e.target.value as Granularity)}
          >
            {(Object.keys(GRAN_LABELS) as Granularity[]).map((g) => (
              <option key={g} value={g}>{GRAN_LABELS[g]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table className="metrics detail num">
          <thead>
            <tr>
              <th className="metric-name">Metric</th>
              {columns.map((c) => (
                <th key={c.key} className={c.complete ? '' : 'col-partial'}>
                  {c.label}
                  {!c.complete && '*'}
                  {!c.complete && (
                    <span className="col-partial-note">{c.monthCount} of {c.expected} mo</span>
                  )}
                </th>
              ))}
              <th className="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_DEFS.map((def) => {
              const isMargin = def.format === 'percent';
              const trClass = [
                RULED.has(def.key) ? 'metric-rule' : '',
                TOTAL_LINES.has(def.key) ? 'metric-total' : '',
                isMargin ? 'metric-margin' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const fmt = (v: number) => (def.format === 'percent' ? formatPercent(v) : formatCurrency(v));
              return (
                <tr key={def.key} className={trClass}>
                  <td className="metric-name" title={def.help}>{def.label}</td>
                  {columns.map((c) => (
                    <td key={c.key} className={c.complete ? '' : 'col-partial'}>{fmt(c.values[def.key])}</td>
                  ))}
                  <td className="col-total">{fmt(totals[def.key])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {partials.length > 0 && (
        <p className="var-caption">
          <strong>*</strong> Partial {unit}
          {partials.length > 1 ? 's' : ''} ({partials.map((c) => `${c.label}: ${c.monthCount} of ${c.expected} months`).join(', ')}).
          Flow figures cover only the months available, so they are not directly comparable to complete periods;
          margins and cash are unaffected.
        </p>
      )}
    </div>
  );
}
