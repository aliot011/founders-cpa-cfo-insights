import { useMemo, useState } from 'react';
import type { AccountMap, LedgerEntry } from '../types';
import { computeVariance, type PnlLine, type Period } from '../lib/variance';
import { formatCurrency, formatMonth, formatPercent, shiftMonth } from '../lib/format';

interface Props {
  entries: LedgerEntry[];
  accountMap: AccountMap;
  months: string[]; // sorted YYYY-MM
}

type Granularity = 'month' | 'quarter' | 'year';

const GRANULARITY: Record<Granularity, { label: string; span: number; abbr: string }> = {
  month: { label: 'Month ending', span: 1, abbr: '' },
  quarter: { label: 'Quarter ending', span: 3, abbr: 'QE ' },
  year: { label: 'Year ending', span: 12, abbr: 'YE ' },
};

/** Build the inclusive month range for a period that ends at `end`. */
function periodFor(end: string, g: Granularity): Period {
  return { start: shiftMonth(end, -(GRANULARITY[g].span - 1)), end };
}

function periodLabel(end: string, g: Granularity): string {
  return `${GRANULARITY[g].abbr}${formatMonth(end)}`;
}

/** Signed currency with an explicit + and a dash for zero. */
function signed(n: number): string {
  if (!isFinite(n)) return '—';
  if (n === 0) return '—';
  return `${n > 0 ? '+' : ''}${formatCurrency(n)}`;
}

function signClass(n: number | null): string {
  if (n == null || !isFinite(n) || n === 0) return 'muted';
  return n > 0 ? 'pos' : 'neg';
}

export function VarianceAnalysis({ entries, accountMap, months }: Props) {
  const last = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : last;
  const [gran, setGran] = useState<Granularity>('month');
  const [p1End, setP1End] = useState(prev);
  const [p2End, setP2End] = useState(last);

  const p1 = periodFor(p1End, gran);
  const p2 = periodFor(p2End, gran);

  const report = useMemo(
    () => computeVariance(entries, accountMap, p1, p2),
    [entries, accountMap, p1.start, p1.end, p2.start, p2.end],
  );

  const h1 = periodLabel(p1End, gran);
  const h2 = periodLabel(p2End, gran);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Variance analysis</h3>
        <div className="period-picker">
          <select className="pp-gran" value={gran} onChange={(e) => setGran(e.target.value as Granularity)}>
            {(Object.keys(GRANULARITY) as Granularity[]).map((g) => (
              <option key={g} value={g}>{GRANULARITY[g].label}</option>
            ))}
          </select>
          <select value={p1End} onChange={(e) => setP1End(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
          <span className="pp-vs">vs</span>
          <select value={p2End} onChange={(e) => setP2End(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
        </div>
      </div>

      <div className="panel-body">
        {/* ---- P&L totals ---- */}
        <h4 className="var-subhead">Profit &amp; Loss</h4>
        <div className="table-scroll">
          <table className="metrics variance num">
            <thead>
              <tr>
                <th className="metric-name">Line item</th>
                <th>{h1}</th>
                <th>{h2}</th>
                <th>$ Change</th>
                <th>% Change</th>
              </tr>
            </thead>
            <tbody>
              {report.pnlLines.map((l) => (
                <PnlRow key={l.key} line={l} />
              ))}
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
                      <td className={`num ${signClass(r.change)}`}>{signed(r.change)}</td>
                      <td className={`num ${signClass(r.change)}`}>{pctText(r.pctChange, r.change)}</td>
                      <td className={`num ${signClass(r.cashImpact)}`}>{signed(r.cashImpact ?? 0)}</td>
                    </tr>
                  ))}
                  <tr className="var-summary">
                    <td className="metric-name">Change in cash (actual)</td>
                    <td className="num" colSpan={4}></td>
                    <td className={`num ${signClass(report.cashActualChange)}`}>{signed(report.cashActualChange)}</td>
                  </tr>
                  <tr className="var-summary">
                    <td className="metric-name">Net cash impact — non-cash B/S</td>
                    <td className="num" colSpan={4}></td>
                    <td className={`num ${signClass(report.bsCashImpactTotal)}`}>{signed(report.bsCashImpactTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="var-caption">
              <strong>Cash Impact</strong> uses the indirect method: an increase in an asset uses cash
              (negative); an increase in a liability or equity account is a source of cash (positive). When{' '}
              {h2} immediately follows {h1}, Net Income ({formatCurrency(report.netIncomeP2)}) + net B/S cash
              impact ({signed(report.bsCashImpactTotal)}) reconciles to the change in cash (
              {signed(report.cashActualChange)}). Balance columns are cumulative within the loaded ledger.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function PnlRow({ line }: { line: PnlLine }) {
  const rowClass = line.emphasis ? 'var-summary' : line.sub ? 'var-sub' : '';
  const isPct = line.format === 'percent';

  const v1 = isPct ? formatPercent(line.p1) : formatCurrency(line.p1);
  const v2 = isPct ? formatPercent(line.p2) : formatCurrency(line.p2);

  // For margin rows the "$ Change" column shows percentage-point movement.
  const changeText = isPct ? ptsText(line.change) : signed(line.change);
  const changeCls = signClass(line.change);
  const pctCls = signClass(line.pctChange);

  return (
    <tr className={rowClass}>
      <td className={`metric-name${line.sub ? ' var-indent' : ''}`}>{line.label}</td>
      <td className="num">{v1}</td>
      <td className="num">{v2}</td>
      <td className={`num ${changeCls}`}>{changeText}</td>
      <td className={`num ${pctCls}`}>{pctText(line.pctChange, line.change)}</td>
    </tr>
  );
}

function pctText(pctChange: number | null, change: number): string {
  if (pctChange != null) return `${pctChange > 0 ? '+' : ''}${formatPercent(pctChange)}`;
  if (!isFinite(change) || change === 0) return '—';
  return 'new';
}

function ptsText(change: number): string {
  if (!isFinite(change) || change === 0) return '—';
  return `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)} pts`;
}
