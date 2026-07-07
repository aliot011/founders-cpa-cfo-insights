import { METRIC_DEFS, type MetricKey, type MonthlyMetrics } from '../types';
import { formatCurrency, formatMonthShort, formatPercent } from '../lib/format';

interface Props {
  metrics: MonthlyMetrics[];
}

/** Subtotal / total rows that get a rule line above them. */
const RULED = new Set<MetricKey>(['grossProfit', 'operatingProfit', 'netIncome']);

/** Column totals: flows sum, margins recompute on totals, cash = ending balance. */
function computeTotals(metrics: MonthlyMetrics[]): Record<MetricKey, number> {
  const sum = (k: MetricKey) => metrics.reduce((t, m) => t + (isFinite(m[k]) ? m[k] : 0), 0);
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
    cash: metrics.length > 0 ? metrics[metrics.length - 1].cash : NaN,
  };
}

/** Full metric-by-month grid with a total column. */
export function MetricsTable({ metrics }: Props) {
  const totals = computeTotals(metrics);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>All metrics by month</h3>
        <span className="muted" style={{ fontSize: 12 }}>Total = sum of months (margins recomputed; cash = ending balance)</span>
      </div>
      <div className="table-scroll">
        <table className="metrics detail num">
          <thead>
            <tr>
              <th className="metric-name">Metric</th>
              {metrics.map((m) => (
                <th key={m.month}>{formatMonthShort(m.month)}</th>
              ))}
              <th className="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_DEFS.map((def) => {
              const ruled = RULED.has(def.key);
              const isMargin = def.format === 'percent';
              const trClass = [ruled ? 'metric-rule' : '', isMargin ? 'metric-margin' : '']
                .filter(Boolean)
                .join(' ');
              const fmt = (v: number) => (def.format === 'percent' ? formatPercent(v) : formatCurrency(v));
              return (
                <tr key={def.key} className={trClass}>
                  <td className="metric-name" title={def.help}>{def.label}</td>
                  {metrics.map((m) => (
                    <td key={m.month}>{fmt(m[def.key])}</td>
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
