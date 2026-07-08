import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AccountMap, Category, LedgerEntry } from '../types';
import { formatCurrency, formatCurrencyExact, formatMonth, formatMonthShort } from '../lib/format';
import { findMissingRecurringVendors, type RecurringMiss } from '../lib/recurring';
import { findMultiAccountVendors, type MultiAccountVendor } from '../lib/multiAccount';
import { checkSegment, companyPath, type CheckId } from '../lib/routes';

interface Props {
  entries: LedgerEntry[];
  accountMap: AccountMap;
  /** Company slug + active check, both from the URL. */
  slug: string;
  check: CheckId;
  /** Most recent closed month — the default review month. */
  closedThrough?: string | null;
}

/** Accounts whose lines count as expense activity for the checks. */
const SPEND_CATS = new Set<Category>(['cogs', 'opex', 'other_expense']);

const CHECK_LABELS: Record<CheckId, string> = {
  'missing-vendor': 'Missing vendors',
  'missing-customer': 'Missing customers',
  'missing-recurring': 'Missing recurring',
  'multi-account': 'Multi-account vendors',
  'parent-account': 'Parent accounts',
};

const CHECK_ORDER: CheckId[] = [
  'missing-vendor',
  'missing-customer',
  'missing-recurring',
  'multi-account',
  'parent-account',
];

/** Journal entries get their own bucket; every other flagged type is per-check. */
function isJournalEntry(e: LedgerEntry): boolean {
  return (e.transactionType ?? '').toLowerCase().includes('journal');
}

/** YYYY-MM-DD -> MM/DD/YYYY, matching how QuickBooks displays dates. */
function usDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${m}/${d}/${y}` : iso;
}

const byDateDesc = (a: LedgerEntry, b: LedgerEntry) =>
  b.date.localeCompare(a.date) || a.account.localeCompare(b.account);

export function Checks({ entries, accountMap, slug, check, closedThrough }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const months = useMemo(() => [...new Set(entries.map((e) => e.month))].sort(), [entries]);
  const latest = months[months.length - 1];

  // The month under review: ?month= in the URL, else the closed month, else latest.
  const paramMonth = searchParams.get('month');
  const reviewMonth =
    paramMonth && months.includes(paramMonth)
      ? paramMonth
      : closedThrough && months.includes(closedThrough)
        ? closedThrough
        : latest;

  const cat = (e: LedgerEntry) => accountMap[e.account] ?? 'ignore';
  const flagged = useMemo(() => {
    const inMonth = entries.filter((e) => e.month === reviewMonth);
    // Every account that has at least one sub-account under it ("A" and
    // "A:B" for "A:B:C"), from the full chart of accounts.
    const parentAccounts = new Set<string>();
    for (const account of Object.keys(accountMap)) {
      const parts = account.split(':');
      for (let i = 1; i < parts.length; i++) parentAccounts.add(parts.slice(0, i).join(':'));
    }
    return {
      'missing-vendor': inMonth.filter((e) => SPEND_CATS.has(cat(e)) && !e.vendor && !e.name).sort(byDateDesc),
      'missing-customer': inMonth.filter((e) => cat(e) === 'revenue' && !e.customer && !e.name).sort(byDateDesc),
      'missing-recurring': reviewMonth ? findMissingRecurringVendors(entries, accountMap, reviewMonth) : [],
      'multi-account': reviewMonth ? findMultiAccountVendors(entries, accountMap, reviewMonth) : [],
      'parent-account': inMonth
        .filter((e) => SPEND_CATS.has(cat(e)) && parentAccounts.has(e.account))
        .sort(byDateDesc),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, accountMap, reviewMonth]);

  if (!reviewMonth) return null;
  const monthLabel = formatMonth(reviewMonth);
  const maybeOpen =
    reviewMonth === latest && reviewMonth !== closedThrough
      ? ' This is the latest synced month, which may still be in progress.'
      : '';

  return (
    <>
      <nav className="tabs subtabs" role="tablist" aria-label="Checks">
        {CHECK_ORDER.map((id) => {
          const count = flagged[id].length;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={check === id}
              className={`tab${check === id ? ' active' : ''}`}
              onClick={() =>
                navigate(
                  `${companyPath('advisor', slug, 'checks')}/${checkSegment(id)}?month=${reviewMonth}`,
                )
              }
            >
              {CHECK_LABELS[id]}
              <span className={`tab-count${count > 0 ? ' has-alerts' : ''}`}>{count}</span>
            </button>
          );
        })}
        <div className="tabs-meta">
          <div className="period-picker">
            <span className="muted" style={{ fontSize: 12 }}>Reviewing</span>
            <select
              className="pp-gran"
              value={reviewMonth}
              onChange={(e) => setSearchParams({ month: e.target.value })}
            >
              {[...months].reverse().map((m) => (
                <option key={m} value={m}>{formatMonth(m)}</option>
              ))}
            </select>
          </div>
        </div>
      </nav>

      {check === 'missing-vendor' && (
        <TransactionPanel
          title={`Expense transactions without a vendor in ${monthLabel}`}
          otherKind="Expense"
          flagged={flagged['missing-vendor']}
          emptyText={`Every ${monthLabel} expense line carries a vendor (or payee) name — nothing to fix. This check covers accounts categorized as COGS, Operating Expenses, or Other Expense, including journal entries.${maybeOpen}`}
          caption={`These ${monthLabel} lines hit expense accounts but name no vendor, so they are invisible to vendor reporting (including the Vendor Spend tab and the Missing recurring check). Journal entries are the usual culprit. Fix by opening the transaction in QuickBooks, setting its Vendor/Name, then re-syncing.${maybeOpen}`}
        />
      )}

      {check === 'missing-customer' && (
        <TransactionPanel
          title={`Revenue transactions without a customer in ${monthLabel}`}
          otherKind="Sale"
          flagged={flagged['missing-customer']}
          emptyText={`Every ${monthLabel} revenue line carries a customer (or payee) name — nothing to fix. This check covers accounts categorized as Revenue, including journal entries.${maybeOpen}`}
          caption={`These ${monthLabel} lines hit revenue accounts but name no customer, so customer-level revenue reporting cannot see them. Journal entries and bare deposits are the usual culprits. Fix by opening the transaction in QuickBooks, setting its Customer/Name, then re-syncing.${maybeOpen}`}
        />
      )}

      {check === 'missing-recurring' && (
        <RecurringPanel misses={flagged['missing-recurring']} monthLabel={monthLabel} maybeOpen={maybeOpen} />
      )}

      {check === 'multi-account' && (
        <MultiAccountPanel vendors={flagged['multi-account']} monthLabel={monthLabel} />
      )}

      {check === 'parent-account' && (
        <TransactionPanel
          title={`Expenses posted to parent accounts in ${monthLabel}`}
          otherKind="Expense"
          flagged={flagged['parent-account']}
          showPayee
          emptyText={`No ${monthLabel} expenses are posted directly to an account that has sub-accounts — everything is coded down to a leaf account.${maybeOpen}`}
          caption={`These ${monthLabel} lines are coded to a parent account even though it has sub-accounts, so reports show them as the parent's "Other" bucket instead of rolling up cleanly. Recode each to the most specific sub-account in QuickBooks, then re-sync.${maybeOpen}`}
        />
      )}
    </>
  );
}

// ---- Transaction-level checks (missing vendor / customer) ---------------

interface TransactionPanelProps {
  title: string;
  otherKind: string;
  flagged: LedgerEntry[];
  emptyText: string;
  caption: string;
  /** Show the payee column (omitted on the missing-payee checks, where it is empty by definition). */
  showPayee?: boolean;
}

function TransactionPanel({ title, otherKind, flagged, emptyText, caption, showPayee }: TransactionPanelProps) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
      </div>

      {flagged.length === 0 ? (
        <div className="panel-body">
          <p className="sync-empty">{emptyText}</p>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="metrics checks">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>Transaction Type</th>
                  {showPayee && <th>Payee</th>}
                  <th>Account</th>
                  <th>Memo</th>
                  <th className="checks-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((e, i) => (
                  <tr key={i}>
                    <td>{usDate(e.date)}</td>
                    <td>{isJournalEntry(e) ? 'JE' : otherKind}</td>
                    <td>{e.transactionType || '—'}</td>
                    {showPayee && <td>{e.vendor || e.name || e.customer || '—'}</td>}
                    <td>{e.account}</td>
                    <td className="checks-memo">{e.memo || ''}</td>
                    <td className="checks-amount num">{formatCurrencyExact(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="var-caption" style={{ padding: '0 18px 14px' }}>{caption}</p>
        </>
      )}
    </div>
  );
}

// ---- Missing recurring vendors ------------------------------------------

function RecurringPanel({ misses, monthLabel, maybeOpen }: { misses: RecurringMiss[]; monthLabel: string; maybeOpen: string }) {
  const typical = (m: RecurringMiss) =>
    m.steady
      ? `~${formatCurrencyExact(m.avgAmount)}/mo`
      : `${formatCurrencyExact(m.minAmount)}–${formatCurrencyExact(m.maxAmount)}/mo`;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Recurring vendors absent in {monthLabel}</h3>
      </div>

      {misses.length === 0 ? (
        <div className="panel-body">
          <p className="sync-empty">
            Every vendor with a monthly spend streak shows activity in {monthLabel} — nothing looks
            forgotten. A vendor qualifies after appearing at least three months in a row.{maybeOpen}
          </p>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="metrics checks">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Streak</th>
                  <th>Typical spend</th>
                  <th>Txns/mo</th>
                  <th>Account(s)</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {misses.map((m) => (
                  <tr key={m.vendor}>
                    <td>{m.vendor}</td>
                    <td>{m.streak} mo</td>
                    <td>{typical(m)}</td>
                    <td>{Math.round(m.avgTxns * 10) / 10}</td>
                    <td className="checks-memo">{m.accounts.join(', ')}</td>
                    <td>{usDate(m.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="var-caption" style={{ padding: '0 18px 14px' }}>
            These vendors posted expense activity every month right up to {monthLabel}, then went quiet —
            the classic sign of a monthly bill or journal entry that never got recorded. Steady-dollar
            vendors are listed first (highest confidence). If the vendor is genuinely done, no action is
            needed; the flag clears once the streak ages out.{maybeOpen}
          </p>
        </>
      )}
    </div>
  );
}

// ---- Multi-account vendors ------------------------------------------------

function MultiAccountPanel({ vendors, monthLabel }: { vendors: MultiAccountVendor[]; monthLabel: string }) {
  if (vendors.length === 0) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Vendors posting to more than one account</h3>
        </div>
        <div className="panel-body">
          <p className="sync-empty">
            Every vendor's spend stayed in a single expense account over the six months ending {monthLabel} —
            coding looks consistent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="var-caption" style={{ margin: '0 2px 14px' }}>
        Each section is a vendor whose spend hit more than one expense account in the six months ending{' '}
        {monthLabel} — worth a scan for inconsistent coding. Some vendors legitimately span accounts; the
        ones to fix are those bouncing between similar accounts month to month.
      </p>
      {vendors.map((v) => (
        <div className="panel check-vendor-section" key={v.vendor}>
          <div className="panel-head">
            <h3>{v.vendor}</h3>
            <span className="muted" style={{ fontSize: 13 }}>
              {v.rows.length} accounts · {formatCurrency(v.total)}
            </span>
          </div>
          <div className="table-scroll">
            <table className="metrics detail num">
              <thead>
                <tr>
                  <th className="metric-name">Account</th>
                  {v.months.map((m) => (
                    <th key={m}>{formatMonthShort(m)}</th>
                  ))}
                  <th className="col-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.account}>
                    <td className="metric-name">{r.account}</td>
                    {v.months.map((m) => (
                      <td key={m}>
                        {r.byMonth[m] ? formatCurrency(r.byMonth[m]) : <span className="cell-zero">–</span>}
                      </td>
                    ))}
                    <td className="col-total">{formatCurrency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
