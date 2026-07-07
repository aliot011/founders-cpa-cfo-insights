import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
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

const COLORS = {
  revenue: '#0f7a54',
  netIncome: '#2f6fed',
  cash: '#e0b45c',
};

/** Single combined chart: Revenue & Net Income lines, Cash balance columns. */
export function Charts({ metrics }: Props) {
  const data = metrics.slice(-12).map((m) => ({
    month: formatMonthShort(m.month),
    revenue: round(m.revenue),
    netIncome: round(m.netIncome),
    cash: round(m.cash),
  }));

  const axisStyle = { fontSize: 11, fill: 'var(--muted)' };
  const compact = (v: number) => formatCurrency(v, true);

  // When a line series dips below zero the axis no longer starts at $0, so
  // anchor the eye with a dotted zero line (omitted when everything is >= 0).
  const hasNegative = data.some((d) => d.revenue < 0 || d.netIncome < 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Revenue, Net Income &amp; Cash (last 12 months)</h3>
      </div>
      <div className="panel-body">
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data} margin={{ top: 8, right: 18, left: 18, bottom: 18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={axisStyle}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              label={{ value: 'Month', position: 'insideBottom', offset: -10, style: axisStyle }}
            />
            <YAxis
              yAxisId="left"
              tick={axisStyle}
              tickFormatter={compact}
              tickLine={false}
              axisLine={false}
              width={62}
              label={{
                value: 'Revenue & Net Income',
                angle: -90,
                position: 'insideLeft',
                style: { ...axisStyle, textAnchor: 'middle' },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={axisStyle}
              tickFormatter={compact}
              tickLine={false}
              axisLine={false}
              width={62}
              label={{
                value: 'Cash Balance',
                angle: 90,
                position: 'insideRight',
                style: { ...axisStyle, textAnchor: 'middle' },
              }}
            />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={tooltipStyle} />
            <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 12 }} />
            {hasNegative && (
              <ReferenceLine yAxisId="left" y={0} stroke="#000" strokeDasharray="4 4" strokeWidth={1.5} />
            )}
            <Bar
              yAxisId="right"
              dataKey="cash"
              name="Cash Balance"
              fill={COLORS.cash}
              radius={[4, 4, 0, 0]}
              barSize={26}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke={COLORS.revenue}
              strokeWidth={2.5}
              dot={{ r: 2 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="netIncome"
              name="Net Income"
              stroke={COLORS.netIncome}
              strokeWidth={2.5}
              dot={{ r: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
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
