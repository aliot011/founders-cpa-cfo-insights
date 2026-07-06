import { useMemo } from 'react';
import type { AccountMap, Dataset } from '../types';
import { computeMetrics } from '../lib/metrics';
import { formatMonth } from '../lib/format';
import { KpiCards } from './KpiCards';
import { MetricsTable } from './MetricsTable';
import { Charts } from './Charts';
import { AccountMapping } from './AccountMapping';

interface Props {
  dataset: Dataset;
  onMapChange: (map: AccountMap) => void;
}

export function Dashboard({ dataset, onMapChange }: Props) {
  const metrics = useMemo(
    () => computeMetrics(dataset.entries, dataset.accountMap),
    [dataset.entries, dataset.accountMap],
  );

  const hasRevenue = metrics.some((m) => m.revenue !== 0);
  const range =
    metrics.length > 0
      ? `${formatMonth(metrics[0].month)} – ${formatMonth(metrics[metrics.length - 1].month)}`
      : '';

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Latest month</h2>
          <span className="hint">
            {metrics.length > 0 && formatMonth(metrics[metrics.length - 1].month)} · vs. prior month
          </span>
        </div>
        <span className="hint">
          {metrics.length} month{metrics.length === 1 ? '' : 's'} · {range}
        </span>
      </div>

      {!hasRevenue && (
        <div className="callout">
          No revenue was detected. Check the <strong>Account mapping</strong> below and set your income
          accounts to <em>Revenue</em> — most other metrics depend on it.
        </div>
      )}

      <div className="section">
        <KpiCards metrics={metrics} />
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Trends</h2>
        </div>
        <Charts metrics={metrics} />
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Detail</h2>
        </div>
        <MetricsTable metrics={metrics} />
      </div>

      <div className="section">
        <AccountMapping
          entries={dataset.entries}
          accountMap={dataset.accountMap}
          onChange={onMapChange}
        />
      </div>
    </>
  );
}
