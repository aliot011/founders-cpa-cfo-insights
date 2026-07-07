import { METRIC_DEFS, type MonthlyMetrics } from '../types';
import { computeDelta, formatCurrency, formatPercent } from '../lib/format';

interface Props {
  metrics: MonthlyMetrics[];
  /** Month (YYYY-MM) to snapshot; defaults to the latest. */
  asOf?: string;
}

/** One-month snapshot with MoM deltas. */
export function KpiCards({ metrics, asOf }: Props) {
  if (metrics.length === 0) return null;
  const found = asOf ? metrics.findIndex((m) => m.month === asOf) : -1;
  const idx = found >= 0 ? found : metrics.length - 1;
  const current = metrics[idx];
  const prior = idx > 0 ? metrics[idx - 1] : undefined;

  return (
    <div className="kpi-grid">
      {METRIC_DEFS.map((def) => {
        const value = current[def.key];
        const priorValue = prior ? prior[def.key] : undefined;
        const delta = computeDelta(value, priorValue);

        const isPercentMetric = def.format === 'percent';
        const display = isPercentMetric ? formatPercent(value) : formatCurrency(value);

        // Direction: up is green for everything we track (higher = better),
        // except we still colour by sign of change.
        const dir = !isFinite(delta.abs) || delta.abs === 0 ? 'flat' : delta.abs > 0 ? 'up' : 'down';
        const chipText =
          delta.pct != null
            ? `${delta.pct > 0 ? '+' : ''}${formatPercent(delta.pct)}`
            : isFinite(delta.abs) && delta.abs !== 0
              ? 'new'
              : 'n/a';

        const absText = isFinite(delta.abs)
          ? isPercentMetric
            ? `${delta.abs >= 0 ? '+' : ''}${formatPercent(delta.abs)} pts`
            : `${delta.abs >= 0 ? '+' : ''}${formatCurrency(delta.abs)}`
          : '';

        return (
          <div className="kpi" key={def.key}>
            <div className="kpi-label">{def.label}</div>
            <div className="kpi-value num">{display}</div>
            <div className="kpi-delta">
              <span className={`chip ${dir}`}>
                {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•'} {chipText}
              </span>
              {prior && absText && <span className="abs num">{absText}</span>}
              {!prior && <span className="abs">first month</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
