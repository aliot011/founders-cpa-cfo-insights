import { useMemo, useState } from 'react';
import type { AccountMap, Category, LedgerEntry } from '../types';
import { formatCurrencyExact } from '../lib/format';

interface Props {
  entries: LedgerEntry[];
  accountMap: AccountMap;
}

/** Accounts whose lines count as expense activity for the checks. */
const SPEND_CATS = new Set<Category>(['cogs', 'opex', 'other_expense']);

type CheckId = 'missing-vendor' | 'missing-customer';

interface CheckDef {
  id: CheckId;
  label: string;
  title: string;
  /** Kind label for the non-journal bucket. */
  otherKind: string;
  emptyText: string;
  caption: string;
}

const CHECKS: CheckDef[] = [
  {
    id: 'missing-vendor',
    label: 'Missing vendors',
    title: 'Expense transactions without a vendor',
    otherKind: 'Expense',
    emptyText:
      'Every expense line carries a vendor (or payee) name — nothing to fix. This check covers accounts ' +
      'categorized as COGS, Operating Expenses, or Other Expense, including journal entries.',
    caption:
      'These lines hit expense accounts but name no vendor, so they are invisible to vendor reporting ' +
      '(including the Vendor Spend tab). Journal entries are the usual culprit. Fix by opening the ' +
      'transaction in QuickBooks, setting its Vendor/Name, then re-syncing.',
  },
  {
    id: 'missing-customer',
    label: 'Missing customers',
    title: 'Revenue transactions without a customer',
    otherKind: 'Sale',
    emptyText:
      'Every revenue line carries a customer (or payee) name — nothing to fix. This check covers accounts ' +
      'categorized as Revenue, including journal entries.',
    caption:
      'These lines hit revenue accounts but name no customer, so customer-level revenue reporting cannot ' +
      'see them. Journal entries and bare deposits are the usual culprits. Fix by opening the transaction ' +
      'in QuickBooks, setting its Customer/Name, then re-syncing.',
  },
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

export function Checks({ entries, accountMap }: Props) {
  const [check, setCheck] = useState<CheckId>('missing-vendor');

  const flaggedByCheck = useMemo<Record<CheckId, LedgerEntry[]>>(() => {
    const cat = (e: LedgerEntry) => accountMap[e.account] ?? 'ignore';
    return {
      'missing-vendor': entries
        .filter((e) => SPEND_CATS.has(cat(e)) && !e.vendor && !e.name)
        .sort(byDateDesc),
      'missing-customer': entries
        .filter((e) => cat(e) === 'revenue' && !e.customer && !e.name)
        .sort(byDateDesc),
    };
  }, [entries, accountMap]);

  const def = CHECKS.find((c) => c.id === check)!;

  return (
    <>
      <nav className="tabs subtabs" role="tablist" aria-label="Checks">
        {CHECKS.map((c) => {
          const count = flaggedByCheck[c.id].length;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={check === c.id}
              className={`tab${check === c.id ? ' active' : ''}`}
              onClick={() => setCheck(c.id)}
            >
              {c.label}
              <span className={`tab-count${count > 0 ? ' has-alerts' : ''}`}>{count}</span>
            </button>
          );
        })}
      </nav>

      <CheckPanel key={check} def={def} flagged={flaggedByCheck[check]} />
    </>
  );
}

function CheckPanel({ def, flagged }: { def: CheckDef; flagged: LedgerEntry[] }) {
  const total = flagged.reduce((t, e) => t + e.amount, 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{def.title}</h3>
        <span className="muted" style={{ fontSize: 13 }}>
          {flagged.length === 0
            ? 'Nothing flagged'
            : `${flagged.length.toLocaleString()} flagged · ${formatCurrencyExact(total)}`}
        </span>
      </div>

      {flagged.length === 0 ? (
        <div className="panel-body">
          <p className="sync-empty">{def.emptyText}</p>
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
                  <th>Account</th>
                  <th>Memo</th>
                  <th className="checks-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((e, i) => (
                  <tr key={i}>
                    <td>{usDate(e.date)}</td>
                    <td>{isJournalEntry(e) ? 'JE' : def.otherKind}</td>
                    <td>{e.transactionType || '—'}</td>
                    <td>{e.account}</td>
                    <td className="checks-memo">{e.memo || ''}</td>
                    <td className="checks-amount num">{formatCurrencyExact(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="var-caption" style={{ padding: '0 18px 14px' }}>{def.caption}</p>
        </>
      )}
    </div>
  );
}
