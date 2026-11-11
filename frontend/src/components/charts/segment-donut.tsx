'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { SEGMENT_COLORS } from '@/lib/utils';
import { ChartTooltip } from './chart-tooltip';

export function SegmentDonut({ data }: { data: Array<{ slug: string; name: string; count: number }> }) {
  const chartData = data.filter((d) => d.count > 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="count"
          nameKey="name"
          innerRadius={62}
          outerRadius={96}
          paddingAngle={2}
          stroke="#fff"
          strokeWidth={2}
        >
          {chartData.map((entry) => (
            <Cell key={entry.slug} fill={SEGMENT_COLORS[entry.slug] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-2xs text-slate-600">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
