'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './chart-tooltip';

const BAND_COLORS: Record<string, string> = { R: '#4f46e5', F: '#22c55e', M: '#f59e0b' };

export function RfmDistribution({ data }: { data: Array<{ score: number; band: string; count: number }> }) {
  const scores = [1, 2, 3, 4, 5];
  const chartData = scores.map((score) => ({
    score: `Score ${score}`,
    R: data.find((d) => d.band === 'R' && Number(d.score) === score)?.count ?? 0,
    F: data.find((d) => d.band === 'F' && Number(d.score) === score)?.count ?? 0,
    M: data.find((d) => d.band === 'M' && Number(d.score) === score)?.count ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="score" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<ChartTooltip />} />
        <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-2xs text-slate-600">{value}</span>} />
        <Bar dataKey="R" name="Recency" fill={BAND_COLORS.R} radius={[3, 3, 0, 0]} />
        <Bar dataKey="F" name="Frequency" fill={BAND_COLORS.F} radius={[3, 3, 0, 0]} />
        <Bar dataKey="M" name="Monetary" fill={BAND_COLORS.M} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
