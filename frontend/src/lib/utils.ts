import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatCurrency = (value: number | string | null | undefined) =>
  value === null || value === undefined ? '—' : inrFormatter.format(Number(value));

export const formatCurrencyCompact = (value: number | string | null | undefined) =>
  value === null || value === undefined ? '—' : inrCompact.format(Number(value));

export const formatNumber = (value: number | string | null | undefined) =>
  value === null || value === undefined ? '—' : new Intl.NumberFormat('en-IN').format(Number(value));

export const formatPercent = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? '—' : `${Number(value).toFixed(digits)}%`;

export const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const SEGMENT_COLORS: Record<string, string> = {
  champions: '#4f46e5',
  'loyal-customers': '#6366f1',
  'potential-loyalists': '#818cf8',
  'new-customers': '#22c55e',
  'at-risk-customers': '#f59e0b',
  'cannot-lose-them': '#ef4444',
  'hibernating-customers': '#94a3b8',
  'lost-customers': '#64748b',
  'high-service-cost': '#0ea5e9',
  unassigned: '#cbd5e1',
};

export const CHART_PALETTE = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#94a3b8'];
