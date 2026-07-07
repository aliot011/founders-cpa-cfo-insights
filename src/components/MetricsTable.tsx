import { METRIC_DEFS, type MetricKey, type MonthlyMetrics } from '../types';
import { computeDelta, formatCurrency, formatMonthShort, formatPercent } from '../lib/format';

interface Props {
  metrics: MonthlyMetrics[];
}

/** Subtotal / total rows that get a rule line above them. */
const RULED = new Set<MetricKey>(['grossProfit', 'operatingProfit', 'netIncome']);

/** Full metric-by-month grid with MoM % change under each value. */
export function MetricsTable({ metrics }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>All metrics by month</h3>
        <span className="muted" style={{ fontSize: 12 }}>MoM % shown beneath each value</span>
      </div>
      <div className="table-scroll">
        <table className="metrics detail num">
          <thead>
            <tr>
              <th className="metric-name">Metric</th>
              {metrics.map((m) => (
                <th key={m.month}>{formatMonthShort(m.month)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_DEFS.map((def) => {
              const ruled = RULED.has(def.key);
              const isMargin = def.format === 'percent';
              const trClass = [ruled ? 'metric-rule' : '', isMargin ? 'metric-margin' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <tr key={def.key} className={trClass}>
                  <td className="metric-name" title={def.help}>{def.label}</td>
                  {metrics.map((m, i) => {
                    const value = m[def.key];
                    const prior = i > 0 ? metrics[i - 1][def.key] : undefined;
                    const delta = computeDelta(value, prior);
                    const display =
                      def.format === 'percent' ? formatPercent(value) : formatCurrency(value);
                    const deltaClass =
                      !isFinite(delta.abs) || delta.abs === 0 ? 'muted' : delta.abs > 0 ? 'pos' : 'neg';
                    const deltaText =
                      delta.pct != null
                        ? `${delta.pct > 0 ? '+' : ''}${formatPercent(delta.pct)}`
                        : i === 0
                          ? 'n/a'
                          : isFinite(delta.abs) && delta.abs !== 0
                            ? 'new'
                            : '—';
                    return (
                      <td key={m.month}>
                        {display}
                        <span className={`cell-delta ${i === 0 ? 'muted' : deltaClass}`}>{deltaText}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
