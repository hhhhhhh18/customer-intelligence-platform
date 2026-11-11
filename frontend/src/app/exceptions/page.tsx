'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Radar, TriangleAlert, X } from 'lucide-react';
import { useApi, useDebounced } from '@/hooks/use-api';
import { api, ApiError } from '@/services/api';
import type { ApiEnvelope, ExceptionRow, PagedEnvelope } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/common/pagination';
import { formatDateTime, formatNumber, titleCase } from '@/lib/utils';

interface ExceptionSummary {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  bySeverity: Array<{ severity: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

const CATEGORIES = [
  'SEGMENT_CONFLICT',
  'CONSENT_VIOLATION',
  'RETURN_NOT_NETTED',
  'OUTCOME_ATTRIBUTION',
];

export default function ExceptionsPage() {
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 350);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const summary = useApi<ApiEnvelope<ExceptionSummary>>('/exceptions/summary');
  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      category: category || undefined,
      severity: severity || undefined,
      status: status || undefined,
      search: debounced || undefined,
    }),
    [page, category, severity, status, debounced],
  );
  const list = useApi<PagedEnvelope<ExceptionRow>>('/exceptions', params);
  const detail = useApi<ApiEnvelope<ExceptionRow & { recommendation: { recommendationCode: string } | null }>>(
    selectedId ? `/exceptions/${selectedId}` : null,
  );

  const scan = async () => {
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await api.post<
        ApiEnvelope<{ detectors: Array<{ category: string; detected: number; blocked: number }>; totalOpen: number }>
      >('/exceptions/scan');
      setScanMessage(
        result.data.detectors.map((detector) => `${titleCase(detector.category)}: ${detector.detected}`).join(' · ') +
          ` · open total ${result.data.totalOpen}`,
      );
      summary.refresh();
      list.refresh();
    } catch (err) {
      setScanMessage(err instanceof ApiError ? err.message : 'Detection failed');
    } finally {
      setScanning(false);
    }
  };

  const resolve = async (newStatus: 'INVESTIGATING' | 'RESOLVED' | 'IGNORED') => {
    if (!selectedId) return;
    setResolving(true);
    setResolveError(null);
    try {
      await api.patch(`/exceptions/${selectedId}`, {
        status: newStatus,
        resolutionNotes: newStatus === 'RESOLVED' ? 'Reviewed and corrected in source system.' : undefined,
        actor: 'web-console',
      });
      summary.refresh();
      list.refresh();
      detail.refresh();
    } catch (err) {
      setResolveError(err instanceof ApiError ? err.message : 'Could not update exception');
    } finally {
      setResolving(false);
    }
  };

  const requiredCategories = CATEGORIES.map((name) => ({
    name,
    count: summary.data?.data.byCategory.find((row) => row.category === name)?.count ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {requiredCategories.map((item) => (
          <Card key={item.name} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{titleCase(item.name)}</p>
                <p className="mt-1.5 text-xl font-semibold">{formatNumber(item.count)}</p>
                <p className="mt-1 text-2xs text-muted-foreground">Mandatory scenario</p>
              </div>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-md ${
                  item.count > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                <TriangleAlert className="h-4 w-4" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{formatNumber(summary.data?.data.total ?? 0)} total</Badge>
          {(summary.data?.data.byStatus ?? []).map((row) => (
            <Badge key={row.status} variant={statusVariant(row.status)}>
              {titleCase(row.status)}: {formatNumber(row.count)}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {scanMessage ? <span className="text-2xs text-muted-foreground">{scanMessage}</span> : null}
          <Button onClick={scan} disabled={scanning}>
            <Radar className="h-3.5 w-3.5" /> {scanning ? 'Scanning…' : 'Run detection scan'}
          </Button>
        </div>
      </div>

      <div className={selectedId ? 'grid grid-cols-1 gap-4 xl:grid-cols-5' : ''}>
        <Card className={selectedId ? 'overflow-hidden xl:col-span-3' : 'overflow-hidden'}>
          <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Search</label>
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Exception, entity or customer"
              />
            </div>
            <div className="w-52">
              <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Category</label>
              <Select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All categories</option>
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-32">
              <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Severity</label>
              <Select
                value={severity}
                onChange={(event) => {
                  setSeverity(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any</option>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-36">
              <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
              <Select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any</option>
                {['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED'].map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {list.error ? (
            <EmptyState variant="error" title="Could not load exceptions" description={list.error} />
          ) : list.loading ? (
            <TableSkeleton rows={8} columns={7} />
          ) : list.data && list.data.data.length === 0 ? (
            <EmptyState title="No exceptions match" description="Run the detection scan or clear filters." />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Exception</TH>
                    <TH>Category</TH>
                    <TH>Severity</TH>
                    <TH>Entity</TH>
                    <TH>Expected</TH>
                    <TH>Actual</TH>
                    <TH>Detected</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.data?.data.map((row) => (
                    <TR
                      key={row.id}
                      className={`cursor-pointer ${selectedId === row.id ? 'bg-accent/60' : ''}`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <TD className="font-mono text-2xs">{row.exceptionCode}</TD>
                      <TD className="text-xs">{titleCase(row.category)}</TD>
                      <TD>
                        <Badge variant={statusVariant(row.severity)}>{row.severity}</Badge>
                      </TD>
                      <TD className="font-mono text-2xs">{row.entityId}</TD>
                      <TD className="max-w-[160px] truncate text-2xs text-slate-600" title={row.expectedValue ?? ''}>
                        {row.expectedValue ?? '—'}
                      </TD>
                      <TD className="max-w-[160px] truncate text-2xs text-slate-600" title={row.actualValue ?? ''}>
                        {row.actualValue ?? '—'}
                      </TD>
                      <TD className="text-2xs text-muted-foreground">{formatDateTime(row.detectedAt)}</TD>
                      <TD>
                        <Badge variant={statusVariant(row.status)}>{titleCase(row.status)}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination meta={list.data?.meta} onPageChange={setPage} disabled={list.loading} />
            </>
          )}
        </Card>

        {selectedId ? (
          <Card className="xl:col-span-2">
            <CardHeader className="flex-row items-start justify-between border-b border-border">
              <div>
                <CardTitle>Exception evidence</CardTitle>
                <p className="mt-0.5 font-mono text-2xs text-muted-foreground">{detail.data?.data.exceptionCode}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {detail.loading || !detail.data ? (
                <div className="h-40 animate-pulse rounded bg-slate-200" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(detail.data.data.severity)}>{detail.data.data.severity}</Badge>
                    <Badge variant="outline">{titleCase(detail.data.data.category)}</Badge>
                    <Badge variant={statusVariant(detail.data.data.status)}>{titleCase(detail.data.data.status)}</Badge>
                    <span className="font-mono text-2xs text-muted-foreground">rule {detail.data.data.detectionRuleId}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-md border border-border p-2.5">
                      <p className="text-2xs uppercase tracking-wider text-muted-foreground">Expected</p>
                      <p className="mt-1 font-medium text-emerald-700">{detail.data.data.expectedValue ?? '—'}</p>
                    </div>
                    <div className="rounded-md border border-border p-2.5">
                      <p className="text-2xs uppercase tracking-wider text-muted-foreground">Actual</p>
                      <p className="mt-1 font-medium text-red-700">{detail.data.data.actualValue ?? '—'}</p>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-700">{detail.data.data.explanation}</p>

                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Affected records</p>
                    <div className="mt-1 space-y-1 text-xs">
                      <p>
                        Customer:{' '}
                        {detail.data.data.customer ? (
                          <Link
                            href={`/customers/${detail.data.data.customer.customerCode}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {detail.data.data.customer.customerCode}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </p>
                      <p>
                        Entity: <span className="font-mono">{detail.data.data.entityType} / {detail.data.data.entityId}</span>
                      </p>
                      {detail.data.data.recommendation ? (
                        <p>
                          Recommendation:{' '}
                          <span className="font-mono">{detail.data.data.recommendation.recommendationCode}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Stored evidence</p>
                    <pre className="mt-1 max-h-52 overflow-auto rounded-md bg-slate-900 p-3 text-2xs leading-relaxed text-slate-100">
                      {JSON.stringify(detail.data.data.evidence, null, 2)}
                    </pre>
                  </div>

                  {detail.data.data.resolutionNotes ? (
                    <div className="rounded-md bg-secondary/60 p-2.5 text-2xs text-slate-700">
                      <span className="font-semibold">Resolution note:</span> {detail.data.data.resolutionNotes}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => resolve('INVESTIGATING')} disabled={resolving}>
                      Investigate
                    </Button>
                    <Button size="sm" onClick={() => resolve('RESOLVED')} disabled={resolving}>
                      Mark resolved
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => resolve('IGNORED')} disabled={resolving}>
                      Ignore
                    </Button>
                  </div>
                  {resolveError ? <p className="text-2xs text-red-600">{resolveError}</p> : null}
                </>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
