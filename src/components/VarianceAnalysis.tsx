import { useMemo, useState } from 'react';
import type { AccountMap, LedgerEntry } from '../types';
import { computeVariance, type AccountVariance, type Line, type Period } from '../lib/variance';
import { formatCurrency, formatMonth, formatMonthShort, formatPercent } from '../lib/format';

interface Props {
  entries: LedgerEntry[];
  accountMap: AccountMap;
  months: string[]; // sorted YYYY-MM
}

function periodLabel(p: Period): string {
  if (p.start === p.end) return formatMonth(p.start);
  return `${formatMonthShort(p.start)} – ${formatMonthShort(p.end)}`;
}

/** A signed $ change cell + a % change cell, coloured by direction. */
function ChangeCells({ change, pctChange }: { change: number; pctChange: number | null }) {
  const cls = change === 0 ? 'muted' : change > 0 ? 'pos' : 'neg';
  const dollars = change === 0 ? '—' : `${change > 0 ? '+' : ''}${formatCurrency(change)}`;
  const percent =
    pctChange != null
      ? `${pctChange > 0 ? '+' : ''}${formatPercent(pctChange)}`
      : change === 0
        ? '—'
        : 'new';
  return (
    <>
      <td className={`num ${cls}`}>{dollars}</td>
      <td className={`num ${cls}`}>{percent}</td>
    </>
  );
}

export function VarianceAnalysis({ entries, accountMap, months }: Props) {
  const last = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : last;
  const [p1, setP1] = useState<Period>({ start: prev, end: prev });
  const [p2, setP2] = useState<Period>({ start: last, end: last });

  const report = useMemo(
    () => computeVariance(entries, accountMap, p1, p2),
    [entries, accountMap, p1, p2],
  );

  const h1 = periodLabel(p1);
  const h2 = periodLabel(p2);

  const groupByCat = new Map(report.pnlGroups.map((g) => [g.category, g]));

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Variance analysis</h3>
        <PeriodPicker months={months} p1={p1} p2={p2} setP1={setP1} setP2={setP2} />
      </div>
      <div className="panel-body">
        {/* ---- P&L ---- */}
        <h4 className="var-subhead">Profit &amp; Loss</h4>
        <div className="table-scroll">
          <table className="metrics variance num">
            <thead>
              <tr>
                <th className="metric-name">Account</th>
                <th>{h1}</th>
                <th>{h2}</th>
                <th>$ Change</th>
                <th>% Change</th>
              </tr>
            </thead>
            <tbody>
              {renderGroup('revenue')}
              {renderGroup('cogs')}
              {renderSummary(report.summaries.grossProfit)}
              {renderGroup('opex')}
              {renderSummary(report.summaries.operatingProfit)}
              {renderGroup('other_income')}
              {renderGroup('other_expense')}
              {renderSummary(report.summaries.netIncome, true)}
            </tbody>
          </table>
        </div>

        {/* ---- Balance Sheet ---- */}
        <h4 className="var-subhead" style={{ marginTop: 26 }}>Balance Sheet</h4>
        {report.bsRows.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No balance-sheet accounts detected. Map accounts to <em>Cash</em>, <em>Other Asset</em>, or{' '}
            <em>Liability / Equity</em> in the mapping panel to populate this table.
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="metrics variance num">
                <thead>
                  <tr>
                    <th className="metric-name">Account</th>
                    <th>{h1}</th>
                    <th>{h2}</th>
                    <th>$ Change</th>
                    <th>% Change</th>
                    <th>Cash Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bsRows.map((r) => (
                    <tr key={r.account}>
                      <td className="metric-name">{r.account}</td>
                      <td className="num">{formatCurrency(r.p1)}</td>
                      <td className="num">{formatCurrency(r.p2)}</td>
                      <ChangeCells change={r.change} pctChange={r.pctChange} />
                      <td className={`num ${cashImpactClass(r)}`}>{formatCashImpact(r)}</td>
                    </tr>
                  ))}
                  <tr className="var-summary">
                    <td className="metric-name">Change in cash (actual)</td>
                    <td className="num muted" colSpan={4}></td>
                    <td className="num">{signed(report.cashActualChange)}</td>
                  </tr>
                  <tr className="var-summary">
                    <td className="metric-name">Net cash impact — non-cash B/S accounts</td>
                    <td className="num muted" colSpan={4}></td>
                    <td className="num">{signed(report.bsCashImpactTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="var-caption">
              <strong>Cash Impact</strong> uses the indirect method: an increase in an asset uses cash
              (negative), while an increase in a liability or equity account is a source of cash (positive).
              When {h2} immediately follows {h1}, Net Income ({formatCurrency(report.summaries.netIncome.p2)}) +
              net B/S cash impact ({signed(report.bsCashImpactTotal)}) reconciles to the change in cash (
              {signed(report.cashActualChange)}). Balance columns are cumulative within the loaded ledger, so
              treat them as movements from the start of your data if the export omits opening balances.
            </p>
          </>
        )}
      </div>
    </div>
  );

  function renderGroup(category: AccountVariance['category']) {
    const g = groupByCat.get(category);
    if (!g) return null;
    return (
      <>
        <tr className="var-group">
          <td className="metric-name" colSpan={5}>{g.label}</td>
        </tr>
        {g.rows.map((r) => (
          <tr key={r.account}>
            <td className="metric-name var-indent">{r.account}</td>
            <td className="num">{formatCurrency(r.p1)}</td>
            <td className="num">{formatCurrency(r.p2)}</td>
            <ChangeCells change={r.change} pctChange={r.pctChange} />
          </tr>
        ))}
        <tr className="var-subtotal">
          <td className="metric-name">Total {g.label}</td>
          <td className="num">{formatCurrency(g.subtotal.p1)}</td>
          <td className="num">{formatCurrency(g.subtotal.p2)}</td>
          <ChangeCells change={g.subtotal.change} pctChange={g.subtotal.pctChange} />
        </tr>
      </>
    );
  }

  function renderSummary(l: Line, strong = false) {
    return (
      <tr className={strong ? 'var-summary var-net' : 'var-summary'}>
        <td className="metric-name">{l.label}</td>
        <td className="num">{formatCurrency(l.p1)}</td>
        <td className="num">{formatCurrency(l.p2)}</td>
        <ChangeCells change={l.change} pctChange={l.pctChange} />
      </tr>
    );
  }
}

function signed(n: number): string {
  if (n === 0) return '—';
  return `${n > 0 ? '+' : ''}${formatCurrency(n)}`;
}

function formatCashImpact(r: AccountVariance): string {
  if (r.cashImpact == null) return '';
  return signed(r.cashImpact);
}

function cashImpactClass(r: AccountVariance): string {
  if (r.cashImpact == null || r.cashImpact === 0) return 'muted';
  return r.cashImpact > 0 ? 'pos' : 'neg';
}

function PeriodPicker({
  months, p1, p2, setP1, setP2,
}: {
  months: string[];
  p1: Period;
  p2: Period;
  setP1: (p: Period) => void;
  setP2: (p: Period) => void;
}) {
  const opts = months.map((m) => (
    <option key={m} value={m}>{formatMonthShort(m)}</option>
  ));
  // Keep start <= end within each period.
  const upd = (
    setter: (p: Period) => void,
    cur: Period,
    field: 'start' | 'end',
    value: string,
  ) => {
    const next = { ...cur, [field]: value };
    if (next.start > next.end) {
      if (field === 'start') next.end = value;
      else next.start = value;
    }
    setter(next);
  };
  return (
    <div className="period-picker">
      <span className="pp-label">Compare</span>
      <select value={p1.start} onChange={(e) => upd(setP1, p1, 'start', e.target.value)}>{opts}</select>
      <span className="pp-dash">to</span>
      <select value={p1.end} onChange={(e) => upd(setP1, p1, 'end', e.target.value)}>{opts}</select>
      <span className="pp-vs">vs</span>
      <select value={p2.start} onChange={(e) => upd(setP2, p2, 'start', e.target.value)}>{opts}</select>
      <span className="pp-dash">to</span>
      <select value={p2.end} onChange={(e) => upd(setP2, p2, 'end', e.target.value)}>{opts}</select>
    </div>
  );
}
