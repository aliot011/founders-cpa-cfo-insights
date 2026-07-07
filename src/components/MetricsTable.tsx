import { useState } from 'react';
import { METRIC_DEFS, type MetricKey, type MonthlyMetrics } from '../types';
import { formatCurrency, formatMonthShort, formatPercent } from '../lib/format';

interface Props {
  metrics: MonthlyMetrics[];
}

type Granularity = 'month' | 'quarter' | 'year';

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
}

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

function bucket(month: string, gran: Granularity): { key: string; label: string } {
  const [y, m] = month.split('-').map(Number);
  const yy = `'${String(y).slice(2)}`;
  if (gran === 'month') return { key: month, label: formatMonthShort(month) };
  if (gran === 'quarter') {
    const q = Math.floor((m - 1) / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${yy}` };
  }
  return { key: `${y}`, label: `${y}` };
}

/** Group monthly metrics into columns by the chosen granularity. */
function toColumns(metrics: MonthlyMetrics[], gran: Granularity): Column[] {
  const byKey = new Map<string, { label: string; months: MonthlyMetrics[] }>();
  const order: string[] = [];
  for (const m of metrics) {
    const { key, label } = bucket(m.month, gran);
    let c = byKey.get(key);
    if (!c) {
      c = { label, months: [] };
      byKey.set(key, c);
      order.push(key);
    }
    c.months.push(m);
  }
  return order.map((key) => {
    const c = byKey.get(key)!;
    return { key, label: c.label, values: aggregate(c.months) };
  });
}

/** Full metric-by-period grid with a total column. */
export function MetricsTable({ metrics }: Props) {
  const [gran, setGran] = useState<Granularity>('month');
  const columns = toColumns(metrics, gran);
  const totals = aggregate(metrics);

  return (
    <div className="panel">
      <div className="panel-head panel-head-controls">
        <div className="period-picker">
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
                <th key={c.key}>{c.label}</th>
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
                    <td key={c.key}>{fmt(c.values[def.key])}</td>
                  ))}
                  <td className="col-total">{fmt(totals[def.key])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
