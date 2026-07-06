import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyMetrics } from '../types';
import { formatCurrency, formatMonthShort } from '../lib/format';

interface Props {
  metrics: MonthlyMetrics[];
}

export function Charts({ metrics }: Props) {
  const data = metrics.map((m) => ({
    month: formatMonthShort(m.month),
    revenue: round(m.revenue),
    grossProfit: round(m.grossProfit),
    netIncome: round(m.netIncome),
    cash: round(m.cash),
    grossMargin: pct(m.grossMargin),
    operatingMargin: pct(m.operatingMargin),
    netIncomeMargin: pct(m.netIncomeMargin),
  }));

  const axisStyle = { fontSize: 11, fill: 'var(--muted)' };
  const compactAxis = (v: number) => formatCurrency(v, true);

  return (
    <div className="charts-grid">
      <ChartPanel title="Revenue, Gross Profit & Net Income">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f7a54" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#0f7a54" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
            <YAxis tick={axisStyle} tickFormatter={compactAxis} tickLine={false} axisLine={false} width={54} />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0f7a54" strokeWidth={2} fill="url(#gRev)" />
            <Line type="monotone" dataKey="grossProfit" name="Gross Profit" stroke="#b7791f" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="netIncome" name="Net Income" stroke="#2f6fed" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Margins">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
            <YAxis tick={axisStyle} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={44} />
            <Tooltip formatter={(v) => `${Number(v)}%`} contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="grossMargin" name="Gross Margin" stroke="#0f7a54" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="operatingMargin" name="Operating Margin" stroke="#b7791f" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="netIncomeMargin" name="Net Income Margin" stroke="#2f6fed" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Ending Cash Balance">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
            <YAxis tick={axisStyle} tickFormatter={compactAxis} tickLine={false} axisLine={false} width={54} />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={tooltipStyle} />
            <Bar dataKey="cash" name="Cash" fill="#0f7a54" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid var(--line-strong)',
  fontSize: 12,
  boxShadow: 'var(--shadow)',
} as const;

function round(n: number): number {
  return isFinite(n) ? Math.round(n) : 0;
}
function pct(n: number): number {
  return isFinite(n) ? Number((n * 100).toFixed(1)) : 0;
}
