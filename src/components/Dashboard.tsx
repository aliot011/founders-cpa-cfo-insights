import { useMemo, useState } from 'react';
import type { AccountMap, Dataset } from '../types';
import { computeMetrics } from '../lib/metrics';
import { formatMonth } from '../lib/format';
import { KpiCards } from './KpiCards';
import { MetricsTable } from './MetricsTable';
import { Charts } from './Charts';
import { AccountMapping } from './AccountMapping';
import { VarianceAnalysis } from './VarianceAnalysis';

interface Props {
  dataset: Dataset;
  onMapChange: (map: AccountMap) => void;
}

type TabId = 'summary' | 'detail' | 'variance' | 'accounts';

const TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'detail', label: 'Detail' },
  { id: 'variance', label: 'Variance' },
  { id: 'accounts', label: 'Accounts' },
];

export function Dashboard({ dataset, onMapChange }: Props) {
  const [tab, setTab] = useState<TabId>('summary');

  const metrics = useMemo(
    () => computeMetrics(dataset.entries, dataset.accountMap),
    [dataset.entries, dataset.accountMap],
  );

  const months = useMemo(() => metrics.map((m) => m.month), [metrics]);
  const hasRevenue = metrics.some((m) => m.revenue !== 0);
  const range =
    metrics.length > 0
      ? `${formatMonth(metrics[0].month)} – ${formatMonth(metrics[metrics.length - 1].month)}`
      : '';

  return (
    <>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="tabs-meta hint">
          {metrics.length} month{metrics.length === 1 ? '' : 's'} · {range}
        </span>
      </nav>

      {tab === 'summary' && (
        <>
          {!hasRevenue && (
            <div className="callout">
              No revenue was detected. Open the <strong>Accounts</strong> tab and set your income accounts to{' '}
              <em>Revenue</em> — most other metrics depend on it.
            </div>
          )}

          <div className="section">
            <Charts metrics={metrics} />
          </div>

          <div className="section-head">
            <div>
              <h2>Latest month</h2>
              <span className="hint">
                {metrics.length > 0 && formatMonth(metrics[metrics.length - 1].month)} · vs. prior month
              </span>
            </div>
          </div>
          <div className="section">
            <KpiCards metrics={metrics} />
          </div>
        </>
      )}

      {tab === 'detail' && (
        <div className="section">
          <MetricsTable metrics={metrics} />
        </div>
      )}

      {tab === 'variance' && months.length > 0 && (
        <div className="section">
          <VarianceAnalysis entries={dataset.entries} accountMap={dataset.accountMap} months={months} />
        </div>
      )}

      {tab === 'accounts' && (
        <div className="section">
          <AccountMapping
            entries={dataset.entries}
            accountMap={dataset.accountMap}
            onChange={onMapChange}
            open
          />
        </div>
      )}
    </>
  );
}
