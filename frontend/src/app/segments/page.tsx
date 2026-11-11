'use client';

import { useState } from 'react';
import { AlertTriangle, Play, RefreshCw } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/services/api';
import type { ApiEnvelope, Segment } from '@/types';
import { PageSection } from '@/components/common/page-section';
import { SegmentDonut } from '@/components/charts/segment-donut';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime, formatNumber, formatPercent, titleCase } from '@/lib/utils';

interface Conflict {
  customerId: number;
  customerCode: string;
  explanation: string;
  segments: Array<{ membershipCode: string; segmentCode: string; name: string; slug: string; ruleVersion: string; assignedAt: string }>;
}

interface RunSummary {
  runCode: string;
  asOfDate: string;
  ruleVersion: string;
  customersScored: number;
  membershipsCreated: number;
  membershipsSuperseded: number;
  unchanged: number;
  unassigned: number;
  conflictsDetected: number;
  durationMs: number;
  segmentCounts: Array<{ slug: string; name: string; count: number }>;
}

export default function SegmentsPage() {
  const segments = useApi<ApiEnvelope<Segment[]>>('/segments');
  const conflicts = useApi<ApiEnvelope<Conflict[]>>('/segments/conflicts');
  const runs = useApi<ApiEnvelope<Array<{ runCode: string; asOfDate: string; customersScored: number; membershipsCreated: number; conflictsDetected: number; status: string; startedAt: string }>>>('/segments/runs');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSegmentation = async () => {
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<ApiEnvelope<RunSummary>>('/segments/run', { actor: 'web-console' });
      setMessage(
        `Scored ${formatNumber(result.data.customersScored)} customers in ${result.data.durationMs}ms — ${formatNumber(
          result.data.membershipsCreated,
        )} new memberships, ${result.data.conflictsDetected} conflicts.`,
      );
      segments.refresh();
      conflicts.refresh();
      runs.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Segmentation failed');
    } finally {
      setRunning(false);
    }
  };

  const data = segments.data?.data ?? [];
  const totalCustomers = data.reduce((sum, segment) => sum + segment.customerCount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Rule version rfm-v1.0.0</Badge>
          <Badge variant="outline">Quintile scoring</Badge>
          <Badge variant="outline">Exclusive assignment</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => segments.refresh()} disabled={segments.loading}>
            <RefreshCw className={segments.loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Refresh
          </Button>
          <Button onClick={runSegmentation} disabled={running}>
            <Play className="h-3.5 w-3.5" /> {running ? 'Running…' : 'Run segmentation'}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PageSection title="Segment mix" description={`${formatNumber(totalCustomers)} active memberships`}>
          {segments.loading ? (
            <Skeleton className="m-5 h-[260px]" />
          ) : (
            <div className="px-2 py-3">
              <SegmentDonut data={data.map((segment) => ({ slug: segment.slug, name: segment.name, count: segment.customerCount }))} />
            </div>
          )}
        </PageSection>

        <PageSection
          title="Conflicting memberships"
          description="Customers holding more than one active exclusive segment"
          className="xl:col-span-2"
        >
          {conflicts.loading ? (
            <Skeleton className="m-5 h-32" />
          ) : (conflicts.data?.data.length ?? 0) === 0 ? (
            <EmptyState title="No conflicts detected" description="Every customer holds exactly one active exclusive membership." />
          ) : (
            <div className="divide-y divide-border">
              {conflicts.data?.data.map((conflict) => (
                <div key={conflict.customerCode} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="font-mono text-xs font-medium">{conflict.customerCode}</span>
                    <Badge variant="destructive">{conflict.segments.length} active exclusive segments</Badge>
                    <a href={`/customers/${conflict.customerCode}`} className="ml-auto text-2xs font-medium text-primary hover:underline">
                      Inspect customer
                    </a>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {conflict.segments.map((membership) => (
                      <span key={membership.membershipCode} className="rounded-md border border-border px-2 py-1 text-2xs">
                        <span className="font-medium">{membership.name}</span>
                        <span className="ml-1 font-mono text-muted-foreground">{membership.ruleVersion}</span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{conflict.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </PageSection>
      </div>

      <PageSection title="Segment catalogue" description="Rules are evaluated in priority order; first match wins">
        {segments.loading ? (
          <Skeleton className="m-5 h-64" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Priority</TH>
                <TH>Segment</TH>
                <TH>Category</TH>
                <TH>Customers</TH>
                <TH>Share</TH>
                <TH>Rule definition</TH>
                <TH>Exclusive</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((segment) => (
                <TR key={segment.id}>
                  <TD className="font-mono text-xs text-muted-foreground">{segment.priority}</TD>
                  <TD>
                    <span className="font-medium">{segment.name}</span>
                    <span className="block font-mono text-2xs text-muted-foreground">{segment.segmentCode}</span>
                  </TD>
                  <TD>
                    <Badge variant="muted">{titleCase(segment.category)}</Badge>
                  </TD>
                  <TD className="font-medium">{formatNumber(segment.customerCount)}</TD>
                  <TD>{formatPercent(segment.shareOfBase)}</TD>
                  <TD className="max-w-md text-xs text-slate-600">{segment.explanation}</TD>
                  <TD>{segment.isExclusive ? <Badge variant="secondary">Exclusive</Badge> : <Badge variant="muted">Overlay</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </PageSection>

      <PageSection title="Segmentation runs" description="History of scoring executions">
        {runs.loading ? (
          <Skeleton className="m-5 h-24" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Run</TH>
                <TH>As of</TH>
                <TH>Started</TH>
                <TH>Scored</TH>
                <TH>Created</TH>
                <TH>Conflicts</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {(runs.data?.data ?? []).map((run) => (
                <TR key={run.runCode}>
                  <TD className="font-mono text-xs">{run.runCode}</TD>
                  <TD className="text-xs">{formatDateTime(run.asOfDate)}</TD>
                  <TD className="text-xs text-muted-foreground">{formatDateTime(run.startedAt)}</TD>
                  <TD>{formatNumber(run.customersScored)}</TD>
                  <TD>{formatNumber(run.membershipsCreated)}</TD>
                  <TD>{formatNumber(run.conflictsDetected)}</TD>
                  <TD>
                    <Badge variant={run.status === 'COMPLETED' ? 'success' : 'warning'}>{run.status}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </PageSection>
    </div>
  );
}
