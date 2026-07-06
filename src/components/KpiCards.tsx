import { METRIC_DEFS, type MonthlyMetrics } from '../types';
import { computeDelta, formatCurrency, formatPercent } from '../lib/format';

interface Props {
  metrics: MonthlyMetrics[];
}

/** Latest-month snapshot with MoM deltas. */
export function KpiCards({ metrics }: Props) {
  if (metrics.length === 0) return null;
  const current = metrics[metrics.length - 1];
  const prior = metrics.length > 1 ? metrics[metrics.length - 2] : undefined;

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
              : '—';

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
