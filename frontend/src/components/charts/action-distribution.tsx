'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './chart-tooltip';

export function ActionDistribution({
  data,
}: {
  data: Array<{ action: string; eligible: number; suppressed: number; noAction: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="action"
          width={150}
          tick={{ fontSize: 11, fill: '#475569' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-2xs text-slate-600">{value}</span>} />
        <Bar dataKey="eligible" name="Eligible" stackId="a" fill="#4f46e5" radius={[0, 0, 0, 0]} />
        <Bar dataKey="suppressed" name="Suppressed" stackId="a" fill="#f59e0b" />
        <Bar dataKey="noAction" name="No action" stackId="a" fill="#cbd5e1" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OutcomePerformance({
  data,
}: {
  data: Array<{ action: string; success: number; failure: number; noResponse: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="action"
          width={150}
          tick={{ fontSize: 11, fill: '#475569' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-2xs text-slate-600">{value}</span>} />
        <Bar dataKey="success" name="Success" stackId="o" fill="#22c55e" />
        <Bar dataKey="failure" name="Failure" stackId="o" fill="#ef4444" />
        <Bar dataKey="noResponse" name="No response" stackId="o" fill="#cbd5e1" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
