'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrencyCompact, formatNumber } from '@/lib/utils';
import { ChartTooltip } from './chart-tooltip';

export function RevenueTrend({
  data,
}: {
  data: Array<{ month: string; revenue: number; orders: number; customers: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          yAxisId="revenue"
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatCurrencyCompact(value)}
          width={70}
        />
        <YAxis yAxisId="orders" orientation="right" hide />
        <Tooltip content={<ChartTooltip valueType="currency" />} />
        <Area
          yAxisId="revenue"
          type="monotone"
          dataKey="revenue"
          name="Net revenue"
          stroke="#4f46e5"
          strokeWidth={2}
          fill="url(#revenueFill)"
        />
        <Line yAxisId="orders" type="monotone" dataKey="orders" name="Orders" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function EngagementTrend({ data }: { data: Array<{ month: string; events: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 10, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatNumber(value)}
          width={48}
        />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="events" name="Events" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.12} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
