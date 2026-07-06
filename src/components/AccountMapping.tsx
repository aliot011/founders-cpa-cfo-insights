import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, type AccountMap, type Category, type LedgerEntry } from '../types';
import { formatCurrency } from '../lib/format';

interface Props {
  entries: LedgerEntry[];
  accountMap: AccountMap;
  onChange: (map: AccountMap) => void;
  /** Render expanded by default (e.g. when shown in its own tab). */
  open?: boolean;
}

const CATEGORY_ORDER: Category[] = [
  'revenue', 'cogs', 'opex', 'other_income', 'other_expense',
  'cash', 'asset', 'liability_equity', 'ignore',
];

const CATEGORY_COLORS: Record<Category, { bg: string; fg: string }> = {
  revenue: { bg: '#e6f2ec', fg: '#0b5a3e' },
  cogs: { bg: '#fdeede', fg: '#8a5a12' },
  opex: { bg: '#fbe9e7', fg: '#9c3a2f' },
  other_income: { bg: '#e7f0fb', fg: '#274f9c' },
  other_expense: { bg: '#f1e8fb', fg: '#5a3a9c' },
  cash: { bg: '#e4f4f2', fg: '#0b5147' },
  asset: { bg: '#e9f6ee', fg: '#1f6b3b' },
  liability_equity: { bg: '#fdf0e6', fg: '#8a4a12' },
  ignore: { bg: '#eef1ef', fg: '#6b7a74' },
};

export function AccountMapping({ entries, accountMap, onChange, open }: Props) {
  const [query, setQuery] = useState('');

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const e of entries) t[e.account] = (t[e.account] ?? 0) + e.amount;
    return t;
  }, [entries]);

  const accounts = useMemo(
    () => Object.keys(accountMap).sort((a, b) => a.localeCompare(b)),
    [accountMap],
  );

  const filtered = accounts.filter((a) => a.toLowerCase().includes(query.toLowerCase()));

  const counts = useMemo(() => {
    const c = {} as Record<Category, number>;
    for (const cat of CATEGORY_ORDER) c[cat] = 0;
    for (const a of accounts) c[accountMap[a]]++;
    return c;
  }, [accounts, accountMap]);

  function setCategory(account: string, cat: Category) {
    onChange({ ...accountMap, [account]: cat });
  }

  return (
    <details className="collapse panel" open={open}>
      <summary className="panel-head">
        <h3>Account mapping ({accounts.length} accounts)</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          {counts.ignore} ignored · click to review ▾
        </span>
      </summary>
      <div className="panel-body">
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          We auto-classified each account. Fix any that are wrong — the metrics recompute instantly and your
          mapping is saved in this browser.
        </p>
        <div className="mapping-toolbar">
          <input
            className="search"
            placeholder="Search accounts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="table-scroll" style={{ maxHeight: 460, overflowY: 'auto' }}>
          <table className="mapping">
            <thead>
              <tr>
                <th>Account</th>
                <th style={{ textAlign: 'right' }}>Net (debit-positive)</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((account) => {
                const cat = accountMap[account];
                const color = CATEGORY_COLORS[cat];
                return (
                  <tr key={account}>
                    <td>{account}</td>
                    <td className="acct-total" style={{ textAlign: 'right' }}>
                      {formatCurrency(totals[account] ?? 0)}
                    </td>
                    <td>
                      <span
                        className="cat-tag"
                        style={{ background: color.bg, color: color.fg, marginRight: 8 }}
                      >
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <select value={cat} onChange={(e) => setCategory(account, e.target.value as Category)}>
                        {CATEGORY_ORDER.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
