'use client';

import { useMemo, useState } from 'react';
import { Info, Play } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/services/api';
import type { ApiEnvelope, DashboardData, OutcomeRow, PagedEnvelope } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/common/pagination';
import { OutcomePerformance } from '@/components/charts/action-distribution';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { formatCurrency, formatNumber, formatPercent, titleCase } from '@/lib/utils';

interface OutcomeMetrics {
  totalOutcomes: number;
  byStatus: { success: number; failure: number; noResponse: number; pending: number };
  eligibleRecommendations: number;
  acceptedActions: number;
  completedActions: number;
  conversionRate: number;
  acceptanceRate: number;
  outcomeSuccessRate: number;
  revenueAttributed: number;
  segmentPerformance: Array<{ segment: string; slug: string; outcomes: number; successes: number; revenue: number; successRate: number }>;
  actionPerformance: Array<{ action: string; slug: string; outcomes: number; successes: number; revenue: number; successRate: number }>;
  note: string;
}

export default function OutcomesPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [simulating, setSimulating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const metrics = useApi<ApiEnvelope<OutcomeMetrics>>('/outcomes/metrics');
  const dashboard = useApi<ApiEnvelope<DashboardData>>('/dashboard/summary');
  const params = useMemo(() => ({ page, pageSize: 20, status: status || undefined }), [page, status]);
  const list = useApi<PagedEnvelope<OutcomeRow>>('/outcomes', params);

  const simulate = async () => {
    setSimulating(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<
        ApiEnvelope<{ created: number; skippedExisting: number; success: number; failure: number; noResponse: number; revenueAttributed: number }>
      >('/outcomes/simulate', { actor: 'web-console' });
      setMessage(
        `${formatNumber(result.data.created)} outcomes recorded (${result.data.success} success · ${result.data.failure} failure · ${result.data.noResponse} no response). ${formatNumber(
          result.data.skippedExisting,
        )} recommendations already had outcomes and were skipped.`,
      );
      metrics.refresh();
      list.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record outcomes');
    } finally {
      setSimulating(false);
    }
  };

  const data = metrics.data?.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-2xs text-sky-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Revenue is attributed to recorded successful outcomes only. No causal uplift is claimed — there is no control
            group or holdout in this prototype.
          </span>
        </div>
        <Button onClick={simulate} disabled={simulating}>
          <Play className="h-3.5 w-3.5" /> {simulating ? 'Recording…' : 'Record outcomes for eligible actions'}
        </Button>
      </div>

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">{message}</div>
      ) : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {!data
          ? Array.from({ length: 5 }).map((_, index) => <Card key={index} className="h-[86px] p-4" />)
          : [
              { label: 'Recorded outcomes', value: formatNumber(data.totalOutcomes), hint: `${formatNumber(data.eligibleRecommendations)} eligible recommendations` },
              { label: 'Accepted actions', value: formatNumber(data.acceptedActions), hint: `Acceptance ${formatPercent(data.acceptanceRate)}` },
              { label: 'Completed actions', value: formatNumber(data.completedActions), hint: 'Recommendation lifecycle completed' },
              { label: 'Conversion rate', value: formatPercent(data.conversionRate), hint: 'Successful outcomes / eligible recommendations' },
              { label: 'Revenue attributed', value: formatCurrency(data.revenueAttributed), hint: 'Successful outcomes only' },
            ].map((kpi) => <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} hint={kpi.hint} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Outcome mix by action</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {dashboard.data ? (
              <OutcomePerformance data={dashboard.data.data.outcomePerformance} />
            ) : (
              <div className="h-[280px] animate-pulse rounded bg-slate-100" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Segment performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Segment</TH>
                  <TH>Outcomes</TH>
                  <TH>Successes</TH>
                  <TH>Success rate</TH>
                  <TH>Revenue</TH>
                </TR>
              </THead>
              <TBody>
                {(data?.segmentPerformance ?? []).map((row) => (
                  <TR key={row.slug}>
                    <TD className="text-xs font-medium">{row.segment}</TD>
                    <TD>{formatNumber(row.outcomes)}</TD>
                    <TD>{formatNumber(row.successes)}</TD>
                    <TD>{formatPercent(row.successRate)}</TD>
                    <TD className="font-medium">{formatCurrency(row.revenue)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Outcome records</p>
            <p className="text-xs text-muted-foreground">Each record is linked to a recommendation, customer and action</p>
          </div>
          <div className="w-44">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {['SUCCESS', 'FAILURE', 'NO_RESPONSE', 'PENDING'].map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {list.error ? (
          <EmptyState variant="error" title="Could not load outcomes" description={list.error} />
        ) : list.loading ? (
          <TableSkeleton rows={8} columns={7} />
        ) : list.data && list.data.data.length === 0 ? (
          <EmptyState title="No outcomes recorded" description="Record outcomes for eligible recommendations." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Outcome</TH>
                  <TH>Recommendation</TH>
                  <TH>Customer</TH>
                  <TH>Action</TH>
                  <TH>Segment</TH>
                  <TH>Status</TH>
                  <TH>Revenue</TH>
                  <TH>Attribution</TH>
                </TR>
              </THead>
              <TBody>
                {list.data?.data.map((row) => (
                  <TR key={row.id}>
                    <TD className="font-mono text-2xs">{row.outcomeCode}</TD>
                    <TD className="font-mono text-2xs text-muted-foreground">{row.recommendation.recommendationCode}</TD>
                    <TD className="text-xs">
                      {row.customer.firstName} {row.customer.lastName}
                      <span className="block font-mono text-2xs text-muted-foreground">{row.customer.customerCode}</span>
                    </TD>
                    <TD className="text-xs">{row.action.name}</TD>
                    <TD className="text-xs">{row.recommendation.segment?.name ?? '—'}</TD>
                    <TD>
                      <Badge variant={statusVariant(row.status)}>{titleCase(row.status)}</Badge>
                    </TD>
                    <TD>{formatCurrency(row.revenueAttributed)}</TD>
                    <TD>
                      {row.isAttributionValid ? (
                        <Badge variant="success">Valid</Badge>
                      ) : (
                        <Badge variant="destructive">Invalid</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={list.data?.meta} onPageChange={setPage} disabled={list.loading} />
          </>
        )}
      </Card>
    </div>
  );
}

