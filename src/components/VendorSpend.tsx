import { useEffect, useMemo, useRef, useState } from 'react';
import { PNL_CATEGORIES, type AccountMap, type Category, type LedgerEntry } from '../types';
import { computeCategorySigns } from '../lib/metrics';
import { bucketMonth, formatCurrency, type Granularity } from '../lib/format';

interface Props {
  entries: LedgerEntry[];
  accountMap: AccountMap;
}

/** Which dimension is the top level of the tiered pivot. */
type RowMode = 'vendor' | 'account';

const GRAN_LABELS: Record<Granularity, string> = {
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Annual',
};

/** How many columns to show per granularity (LTM for month/quarter, up to 5y for year). */
const COLUMN_LIMIT: Record<Granularity, number> = { month: 12, quarter: 4, year: 5 };
const EXPECTED_MONTHS: Record<Granularity, number> = { month: 1, quarter: 3, year: 12 };

/** Categories that count as spend; used for the default account selection. */
const SPEND_CATS = new Set<Category>(['cogs', 'opex', 'other_expense']);

const NO_PAYEE = '(No payee)';

interface Column {
  key: string;
  label: string;
  months: string[];
  monthCount: number;
  expected: number;
  complete: boolean;
}

interface ChildRow {
  label: string;
  cells: number[];
  total: number;
}

interface ParentRow extends ChildRow {
  children: ChildRow[];
}

function windowLabel(gran: Granularity, count: number): string {
  const noun = gran === 'month' ? 'month' : gran === 'quarter' ? 'quarter' : 'year';
  return `Last ${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Best available payee label for a ledger line. */
function payeeOf(e: LedgerEntry): string {
  return e.vendor || e.name || e.customer || NO_PAYEE;
}

const sum = (cells: number[]) => cells.reduce((a, b) => a + b, 0);
const byTotalDesc = (a: ChildRow, b: ChildRow) => b.total - a.total || a.label.localeCompare(b.label);

/** Only P&L accounts belong in a spend pivot — balance-sheet legs (cash, A/P, credit cards) would double-count every payment. */
const PNL_CATS = new Set<Category>(PNL_CATEGORIES);

export function VendorSpend({ entries, accountMap }: Props) {
  const accounts = useMemo(
    () =>
      [...new Set(entries.map((e) => e.account))]
        .filter((a) => PNL_CATS.has(accountMap[a] ?? 'ignore'))
        .sort((a, b) => a.localeCompare(b)),
    [entries, accountMap],
  );
  const spendAccounts = useMemo(
    () => accounts.filter((a) => SPEND_CATS.has(accountMap[a] ?? 'ignore')),
    [accounts, accountMap],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set(spendAccounts));
  const [rowMode, setRowMode] = useState<RowMode>('vendor');
  const [gran, setGran] = useState<Granularity>('month');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function switchMode(mode: RowMode) {
    setRowMode(mode);
    setExpanded(new Set());
  }

  // Distinct months present in the ledger, used for bucketing and partial flags.
  const monthsAll = useMemo(() => [...new Set(entries.map((e) => e.month))].sort(), [entries]);

  // Window to the most recent columns, mirroring the Detail table.
  const columns: Column[] = useMemo(() => {
    const byKey = new Map<string, { label: string; months: string[] }>();
    const order: string[] = [];
    for (const month of monthsAll) {
      const { key, label } = bucketMonth(month, gran);
      let c = byKey.get(key);
      if (!c) {
        c = { label, months: [] };
        byKey.set(key, c);
        order.push(key);
      }
      c.months.push(month);
    }
    const expected = EXPECTED_MONTHS[gran];
    return order.slice(-COLUMN_LIMIT[gran]).map((key) => {
      const c = byKey.get(key)!;
      return {
        key,
        label: c.label,
        months: c.months,
        monthCount: c.months.length,
        expected,
        complete: c.months.length >= expected,
      };
    });
  }, [monthsAll, gran]);

  const pivot = useMemo(() => {
    const monthToCol = new Map<string, number>();
    columns.forEach((c, i) => c.months.forEach((m) => monthToCol.set(m, i)));

    // Flip signs per category so spend reads as a positive, natural magnitude
    // regardless of the export's sign convention (matches the rest of the app).
    const mult = computeCategorySigns(entries, accountMap);

    const allowed = new Set(accounts);
    const parents = new Map<string, { cells: number[]; children: Map<string, number[]> }>();
    const colTotals = columns.map(() => 0);
    for (const e of entries) {
      if (!selected.has(e.account) || !allowed.has(e.account)) continue;
      const col = monthToCol.get(e.month);
      if (col === undefined) continue;
      const payee = payeeOf(e);
      const [pLabel, cLabel] = rowMode === 'vendor' ? [payee, e.account] : [e.account, payee];
      const amount = e.amount * mult[accountMap[e.account] ?? 'ignore'];

      let p = parents.get(pLabel);
      if (!p) {
        p = { cells: columns.map(() => 0), children: new Map() };
        parents.set(pLabel, p);
      }
      let c = p.children.get(cLabel);
      if (!c) {
        c = columns.map(() => 0);
        p.children.set(cLabel, c);
      }
      p.cells[col] += amount;
      c[col] += amount;
      colTotals[col] += amount;
    }

    const rowList: ParentRow[] = [...parents.entries()]
      .map(([label, p]) => ({
        label,
        cells: p.cells,
        total: sum(p.cells),
        children: [...p.children.entries()]
          .map(([cl, cells]) => ({ label: cl, cells, total: sum(cells) }))
          .sort(byTotalDesc),
      }))
      .sort(byTotalDesc);
    return { rowList, colTotals, grand: sum(colTotals) };
  }, [entries, accountMap, accounts, selected, rowMode, columns]);

  const allExpanded = pivot.rowList.length > 0 && pivot.rowList.every((r) => expanded.has(r.label));

  function toggleRow(label: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const partials = columns.filter((c) => !c.complete);
  const unit = gran === 'quarter' ? 'quarter' : 'year';
  const hasVendorData = useMemo(() => entries.some((e) => e.vendor || e.name || e.customer), [entries]);
  const cell = (v: number) => (v === 0 ? <span className="cell-zero">–</span> : formatCurrency(v));

  return (
    <div className="panel panel-pop">
      <div className="panel-head panel-head-controls">
        <div className="period-picker ph-lead">
          <AccountPicker
            accounts={accounts}
            spendAccounts={spendAccounts}
            selected={selected}
            onChange={setSelected}
          />
          <div className="seg" role="group" aria-label="Pivot grouping order">
            {(['vendor', 'account'] as RowMode[]).map((m) => (
              <button key={m} className={rowMode === m ? 'active' : ''} onClick={() => switchMode(m)}>
                {m === 'vendor' ? 'Vendors › Accounts' : 'Accounts › Vendors'}
              </button>
            ))}
          </div>
          {pivot.rowList.length > 0 && (
            <button
              className="btn btn-xs"
              onClick={() => setExpanded(allExpanded ? new Set() : new Set(pivot.rowList.map((r) => r.label)))}
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
        <div className="period-picker">
          <span className="muted" style={{ fontSize: 12 }}>{windowLabel(gran, columns.length)}</span>
          <select className="pp-gran" value={gran} onChange={(e) => setGran(e.target.value as Granularity)}>
            {(Object.keys(GRAN_LABELS) as Granularity[]).map((g) => (
              <option key={g} value={g}>{GRAN_LABELS[g]}</option>
            ))}
          </select>
        </div>
      </div>

      {selected.size === 0 ? (
        <div className="panel-body">
          <p className="muted" style={{ fontSize: 13 }}>Select at least one account to see spend.</p>
        </div>
      ) : pivot.rowList.length === 0 ? (
        <div className="panel-body">
          <p className="muted" style={{ fontSize: 13 }}>
            No transactions found in the selected accounts for this window.
          </p>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="metrics detail num pivot">
              <thead>
                <tr>
                  <th className="metric-name">
                    {rowMode === 'vendor' ? 'Vendor › Account' : 'Account › Vendor'}
                  </th>
                  {columns.map((c) => (
                    <th key={c.key} className={c.complete ? '' : 'col-partial'}>
                      {c.label}
                      {!c.complete && '*'}
                      {!c.complete && (
                        <span className="col-partial-note">{c.monthCount} of {c.expected} mo</span>
                      )}
                    </th>
                  ))}
                  <th className="col-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {pivot.rowList.map((r) => {
                  const isOpen = expanded.has(r.label);
                  return [
                    <tr key={r.label} className="pivot-parent" onClick={() => toggleRow(r.label)}>
                      <td className="metric-name">
                        <button
                          className="pivot-toggle"
                          aria-expanded={isOpen}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toggleRow(r.label);
                          }}
                        >
                          <span className="pivot-caret" aria-hidden>{isOpen ? '▾' : '▸'}</span>
                          {r.label}
                        </button>
                      </td>
                      {r.cells.map((v, i) => (
                        <td key={columns[i].key} className={columns[i].complete ? '' : 'col-partial'}>
                          {cell(v)}
                        </td>
                      ))}
                      <td className="col-total">{formatCurrency(r.total)}</td>
                    </tr>,
                    ...(isOpen
                      ? r.children.map((ch) => (
                          <tr key={`${r.label}::${ch.label}`} className="pivot-childrow">
                            <td className="metric-name pivot-child">{ch.label}</td>
                            {ch.cells.map((v, i) => (
                              <td key={columns[i].key} className={columns[i].complete ? '' : 'col-partial'}>
                                {cell(v)}
                              </td>
                            ))}
                            <td className="col-total">{formatCurrency(ch.total)}</td>
                          </tr>
                        ))
                      : []),
                  ];
                })}
                <tr className="metric-rule metric-total">
                  <td className="metric-name">Total</td>
                  {pivot.colTotals.map((v, i) => (
                    <td key={columns[i].key} className={columns[i].complete ? '' : 'col-partial'}>
                      {formatCurrency(v)}
                    </td>
                  ))}
                  <td className="col-total">{formatCurrency(pivot.grand)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="var-caption" style={{ padding: '0 18px 14px' }}>
            Click a row to break it down by {rowMode === 'vendor' ? 'account' : 'vendor'}. Amounts are net
            debits to the selected accounts, so credits and refunds reduce spend.
            {!hasVendorData &&
              ' This ledger has no Vendor, Customer, or Name columns, so lines are grouped under “(No payee)” — re-export with a Vendor column for a payee breakdown.'}
            {partials.length > 0 && (
              <>
                {' '}
                <strong>*</strong> Partial {unit}
                {partials.length > 1 ? 's' : ''} (
                {partials.map((c) => `${c.label}: ${c.monthCount} of ${c.expected} months`).join(', ')}).
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

interface PickerProps {
  accounts: string[];
  spendAccounts: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

/** Multi-select dropdown of ledger accounts, grouped into spend vs other. */
function AccountPicker({ accounts, spendAccounts, selected, onChange }: PickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(ev: MouseEvent) {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(account: string) {
    const next = new Set(selected);
    if (next.has(account)) next.delete(account);
    else next.add(account);
    onChange(next);
  }

  const spendSet = new Set(spendAccounts);
  const otherAccounts = accounts.filter((a) => !spendSet.has(a));

  const group = (title: string, list: string[]) =>
    list.length > 0 && (
      <>
        <div className="acct-dd-group">{title}</div>
        {list.map((a) => (
          <label key={a} className="acct-dd-item">
            <input type="checkbox" checked={selected.has(a)} onChange={() => toggle(a)} />
            <span>{a}</span>
          </label>
        ))}
      </>
    );

  return (
    <div className="acct-dd" ref={ref}>
      <button className="btn acct-dd-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {selected.size} of {accounts.length} accounts <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="acct-dd-panel">
          <div className="acct-dd-actions">
            <button className="btn btn-xs" onClick={() => onChange(new Set(spendAccounts))}>
              Spend only
            </button>
            <button className="btn btn-xs" onClick={() => onChange(new Set(accounts))}>
              All
            </button>
            <button className="btn btn-xs" onClick={() => onChange(new Set())}>
              None
            </button>
          </div>
          {group('Spend accounts', spendAccounts)}
          {group('Income accounts', otherAccounts)}
        </div>
      )}
    </div>
  );
}
