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

type TabId = 'summary' | 'kpis' | 'detail' | 'variance' | 'accounts';

const TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'kpis', label: 'KPIs' },
  { id: 'detail', label: 'Detail' },
  { id: 'variance', label: 'Flux' },
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
  const latestMonthLabel = metrics.length > 0 ? formatMonth(metrics[metrics.length - 1].month) : 'the latest month';

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
      </nav>

      {tab === 'summary' && (
        <>
          <PageHeader
            title="Summary"
            subtitle="A twelve-month view of revenue, net income, and cash in a single chart, so you can read the trajectory of the business at a glance."
          />
          {!hasRevenue && (
            <div className="callout">
              No revenue was detected. Open the <strong>Accounts</strong> tab and set your income accounts to{' '}
              <em>Revenue</em>, since most other metrics depend on it.
            </div>
          )}
          <div className="section">
            <Charts metrics={metrics} />
          </div>
        </>
      )}

      {tab === 'kpis' && (
        <>
          <PageHeader
            title="Key Metrics"
            subtitle={`Headline numbers for ${latestMonthLabel} with month-over-month change, so you can quickly see what moved and by how much.`}
          />
          <div className="section">
            <KpiCards metrics={metrics} />
          </div>
        </>
      )}

      {tab === 'detail' && (
        <>
          <PageHeader
            title="Detail"
            subtitle="Every metric by month, quarter, or year with a running total, giving you the full financial picture and how each line trends over time."
          />
          <div className="section">
            <MetricsTable metrics={metrics} />
          </div>
        </>
      )}

      {tab === 'variance' && months.length > 0 && (
        <>
          <PageHeader
            title="Flux Analysis"
            subtitle="Compares a period against the one before it across the P&L and balance sheet, so you can explain what changed and how it affected cash."
          />
          <div className="section">
            <VarianceAnalysis entries={dataset.entries} accountMap={dataset.accountMap} months={months} />
          </div>
        </>
      )}

      {tab === 'accounts' && (
        <>
          <PageHeader
            title="Accounts"
            subtitle="Review and correct how each ledger account is categorized. Every metric on the other tabs is calculated from this mapping, so accuracy here drives everything."
          />
          <div className="section">
            <AccountMapping
              entries={dataset.entries}
              accountMap={dataset.accountMap}
              onChange={onMapChange}
              open
            />
          </div>
        </>
      )}
    </>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}
