import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AccountMap, ClientDataset } from '../types';
import { computeMetrics } from '../lib/metrics';
import { formatMonth } from '../lib/format';
import { adminPath, companyPath, TAB_SEGMENTS, type CheckId, type Side } from '../lib/routes';
import { KpiCards } from './KpiCards';
import { MetricsTable } from './MetricsTable';
import { Charts } from './Charts';
import { AccountMapping } from './AccountMapping';
import { VarianceAnalysis } from './VarianceAnalysis';
import { VendorSpend } from './VendorSpend';
import { Checks } from './Checks';

interface Props {
  dataset: ClientDataset;
  onMapChange: (map: AccountMap) => void;
  /** The Sync tab's content, provided by App (it owns client/sync state). */
  syncTab: ReactNode;
  /** Route state: which portal, which tab, and the company's URL slug. */
  side: 'client' | 'advisor';
  tab: TabId;
  slug: string;
  /** Active check when tab === 'checks' (from the URL). */
  check?: CheckId;
  realmId: string;
  /** Most recent closed month (YYYY-MM); reporting tabs stop here. Null = latest. */
  closedThrough?: string | null;
}

export type TabId =
  | 'summary' | 'kpis' | 'detail' | 'variance' | 'vendors'
  | 'checks' | 'accounts' | 'sync' | 'users' | 'companies';

const SIDES: { id: Side; label: string }[] = [
  { id: 'client', label: 'Client' },
  { id: 'advisor', label: 'Advisor' },
  { id: 'admin', label: 'Admin' },
];

/**
 * Portal switcher shared by the company dashboard and the admin pages. All
 * portals are visible to everyone until sign-in exists to tell roles apart.
 */
export function PortalSeg({ side, slug }: { side: Side; slug: string | null }) {
  const navigate = useNavigate();
  function go(target: Side) {
    if (target === side) return;
    if (target === 'admin') navigate(adminPath());
    else if (slug) navigate(companyPath(target, slug));
    else navigate('/');
  }
  return (
    <div className="seg" role="group" aria-label="Portal">
      {SIDES.map((s) => (
        <button key={s.id} className={side === s.id ? 'active' : ''} onClick={() => go(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function Dashboard({ dataset, onMapChange, syncTab, side, tab, slug, check, realmId, closedThrough }: Props) {
  const navigate = useNavigate();
  const [kpiMonth, setKpiMonth] = useState<string | null>(null); // null = latest

  // Reporting tabs stop at the most recent closed month; Checks and Accounts
  // always see the full synced ledger.
  const reportEntries = useMemo(
    () => (closedThrough ? dataset.entries.filter((e) => e.month <= closedThrough) : dataset.entries),
    [dataset.entries, closedThrough],
  );

  const metrics = useMemo(
    () => computeMetrics(reportEntries, dataset.accountMap, dataset.openingBalances),
    [reportEntries, dataset.accountMap, dataset.openingBalances],
  );

  const months = useMemo(() => metrics.map((m) => m.month), [metrics]);
  const hasData = dataset.entries.length > 0;
  const hasReportData = reportEntries.length > 0;
  const hasRevenue = metrics.some((m) => m.revenue !== 0);
  // Selected KPI month, falling back to the latest (also covers stale selections after a re-sync).
  const kpiAsOf = kpiMonth && months.includes(kpiMonth) ? kpiMonth : months[months.length - 1];
  const kpiMonthLabel = kpiAsOf ? formatMonth(kpiAsOf) : 'the latest month';

  const emptyCallout = (
    <div className="callout">
      No data has been synced from QuickBooks yet. Open the <strong>Sync</strong> tab and run the first sync.
    </div>
  );
  // Data exists but the closed month excludes all of it.
  const reportEmptyCallout = hasData ? (
    <div className="callout">
      Every synced month is after the most recent closed month. Adjust it on the <strong>Sync</strong> tab.
    </div>
  ) : (
    emptyCallout
  );

  return (
    <>
      <nav className="tabs" role="tablist">
        {TAB_SEGMENTS[side].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => navigate(companyPath(side, slug, t.segment))}
          >
            {t.label}
          </button>
        ))}
        <div className="tabs-meta">
          <PortalSeg side={side} slug={slug} />
        </div>
      </nav>

      {tab === 'summary' && (
        <>
          <PageHeader
            title="Summary"
            subtitle="A twelve-month view of revenue, net income, and cash in a single chart, so you can read the trajectory of the business at a glance."
          />
          {!hasReportData && reportEmptyCallout}
          {hasReportData && !hasRevenue && (
            <div className="callout">
              No revenue was detected. Open the <strong>Accounts</strong> tab and set your income accounts to{' '}
              <em>Revenue</em>, since most other metrics depend on it.
            </div>
          )}
          {hasReportData && (
            <div className="section">
              <Charts metrics={metrics} />
            </div>
          )}
        </>
      )}

      {tab === 'kpis' && (
        <>
          <PageHeader
            title="Key Metrics"
            subtitle={`Headline numbers for ${kpiMonthLabel} with month-over-month change, so you can quickly see what moved and by how much.`}
          />
          {!hasReportData && reportEmptyCallout}
          {hasReportData && (
            <div className="section">
              <div className="period-picker kpi-toolbar">
                <span className="muted" style={{ fontSize: 12 }}>Month</span>
                <select className="pp-gran" value={kpiAsOf} onChange={(e) => setKpiMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m} value={m}>{formatMonth(m)}</option>
                  ))}
                </select>
              </div>
              <KpiCards metrics={metrics} asOf={kpiAsOf} />
            </div>
          )}
        </>
      )}

      {tab === 'detail' && (
        <>
          <PageHeader
            title="Detail"
            subtitle="Every metric by month, quarter, or year with a running total, giving you the full financial picture and how each line trends over time."
          />
          {!hasReportData && reportEmptyCallout}
          {hasReportData && (
            <div className="section">
              <MetricsTable metrics={metrics} />
            </div>
          )}
        </>
      )}

      {tab === 'variance' && (
        <>
          <PageHeader
            title="Flux Analysis"
            subtitle="Compares a period against the one before it across the P&L and balance sheet, so you can explain what changed and how it affected cash."
          />
          {months.length === 0 && reportEmptyCallout}
          {months.length > 0 && (
            <div className="section">
              <VarianceAnalysis
                entries={reportEntries}
                accountMap={dataset.accountMap}
                openingBalances={dataset.openingBalances}
                months={months}
              />
            </div>
          )}
        </>
      )}

      {tab === 'vendors' && (
        <>
          <PageHeader
            title="Vendor Spend"
            subtitle="A tiered pivot of spend across periods for the accounts you choose — vendors broken down by account, or accounts broken down by vendor — so you can see exactly who you pay and how that spend is trending."
          />
          {!hasReportData && reportEmptyCallout}
          {hasReportData && (
            <div className="section">
              <VendorSpend entries={reportEntries} accountMap={dataset.accountMap} />
            </div>
          )}
        </>
      )}

      {tab === 'checks' && (
        <>
          <PageHeader
            title="Checks"
            subtitle="Data-quality checks over the synced ledger, so bookkeeping gaps get caught and fixed in QuickBooks before they distort the reports."
          />
          {!hasData && emptyCallout}
          {hasData && check && (
            <div className="section">
              <Checks
                entries={dataset.entries}
                accountMap={dataset.accountMap}
                slug={slug}
                check={check}
                closedThrough={closedThrough}
                qboEnvironment={dataset.qboEnvironment}
                realmId={realmId}
                companyName={dataset.companyName}
              />
            </div>
          )}
        </>
      )}

      {tab === 'accounts' && (
        <>
          <PageHeader
            title="Accounts"
            subtitle="Review and correct how each ledger account is categorized. Every metric on the other tabs is calculated from this mapping, so accuracy here drives everything."
          />
          {!hasData && emptyCallout}
          {hasData && (
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
      )}

      {tab === 'sync' && (
        <>
          <PageHeader
            title="Sync"
            subtitle="Pull the latest General Ledger from QuickBooks whenever you want fresh numbers, adjust the date range, and review past syncs."
          />
          {syncTab}
        </>
      )}
    </>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}
