'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, ShieldOff, UserX } from 'lucide-react';
import { useApi, useDebounced } from '@/hooks/use-api';
import { api, ApiError } from '@/services/api';
import type { ApiEnvelope, ConsentRow, PagedEnvelope } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/common/pagination';
import { formatDateTime, formatNumber, formatPercent, titleCase } from '@/lib/utils';

interface ConsentSummary {
  byChannel: Array<{ channel: string; granted: number; withdrawn: number; pending: number }>;
  totalCustomers: number;
  emailReachableCustomers: number;
  suppressionRate: number;
}

export default function ConsentPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 350);
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [currentOnly, setCurrentOnly] = useState('true');
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({
    customerCode: '',
    channel: 'EMAIL',
    purpose: 'MARKETING',
    status: 'WITHDRAWN',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const summary = useApi<ApiEnvelope<ConsentSummary>>('/consent/summary');
  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      search: debounced || undefined,
      channel: channel || undefined,
      status: status || undefined,
      currentOnly: currentOnly || undefined,
    }),
    [page, debounced, channel, status, currentOnly],
  );
  const list = useApi<PagedEnvelope<ConsentRow>>('/consent', params);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    setFormError(null);
    try {
      const response = await api.post<
        ApiEnvelope<{ consent: ConsentRow; previousConsentCode: string | null; suppressedRecommendations: number }>
      >('/consent', { ...form, source: 'WEB_CONSENT_CONSOLE' });
      setResult(
        `${response.data.consent.consentCode} recorded as ${response.data.consent.status}. ` +
          (response.data.previousConsentCode ? `Previous record ${response.data.previousConsentCode} closed. ` : '') +
          (response.data.suppressedRecommendations
            ? `${response.data.suppressedRecommendations} eligible promotional recommendation(s) were suppressed immediately.`
            : 'No eligible promotional recommendations needed suppression.'),
      );
      summary.refresh();
      list.refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not record consent');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Email reachable</p>
              <p className="mt-1.5 text-xl font-semibold">
                {summary.data ? formatNumber(summary.data.data.emailReachableCustomers) : '—'}
              </p>
              <p className="mt-1 text-2xs text-muted-foreground">
                of {summary.data ? formatNumber(summary.data.data.totalCustomers) : '—'} customers
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Suppression rate</p>
              <p className="mt-1.5 text-xl font-semibold">
                {summary.data ? formatPercent(summary.data.data.suppressionRate) : '—'}
              </p>
              <p className="mt-1 text-2xs text-muted-foreground">Customers not reachable by email marketing</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-red-50 text-red-600">
              <UserX className="h-4 w-4" />
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Withdrawn (email)</p>
              <p className="mt-1.5 text-xl font-semibold">
                {summary.data
                  ? formatNumber(summary.data.data.byChannel.find((c) => c.channel === 'EMAIL')?.withdrawn ?? 0)
                  : '—'}
              </p>
              <p className="mt-1 text-2xs text-muted-foreground">Marketing consent withdrawn and enforced</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600">
              <ShieldOff className="h-4 w-4" />
            </span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Record a consent change</CardTitle>
            <p className="text-xs text-muted-foreground">
              Creates a new historical record and closes the previous one. Nothing is overwritten.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Customer code
                </label>
                <Input
                  required
                  placeholder="CUS-000020"
                  value={form.customerCode}
                  onChange={(event) => setForm({ ...form, customerCode: event.target.value.toUpperCase() })}
                  pattern="^CUS-\d{6}$"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Channel
                  </label>
                  <Select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>
                    {['EMAIL', 'SMS', 'PUSH', 'PHONE', 'DIRECT_MAIL'].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Purpose
                  </label>
                  <Select value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })}>
                    {['MARKETING', 'TRANSACTIONAL', 'ANALYTICS', 'PROFILING'].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  New status
                </label>
                <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="WITHDRAWN">WITHDRAWN</option>
                  <option value="GRANTED">GRANTED</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </label>
                <Input
                  placeholder="Reason or reference"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Recording…' : 'Record consent change'}
              </Button>
              {result ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-2xs text-emerald-800">{result}</p>
              ) : null}
              {formError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-2xs text-red-800">{formError}</p>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Search customer
              </label>
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Name, email or CUS-000001"
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Channel</label>
              <Select
                value={channel}
                onChange={(event) => {
                  setChannel(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any</option>
                {['EMAIL', 'SMS', 'PUSH', 'PHONE', 'DIRECT_MAIL'].map((value) => (
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
                {['GRANTED', 'WITHDRAWN', 'PENDING'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">History</label>
              <Select
                value={currentOnly}
                onChange={(event) => {
                  setCurrentOnly(event.target.value);
                  setPage(1);
                }}
              >
                <option value="true">Current only</option>
                <option value="">Full history</option>
              </Select>
            </div>
          </div>

          {list.error ? (
            <EmptyState variant="error" title="Could not load consent records" description={list.error} />
          ) : list.loading ? (
            <TableSkeleton rows={8} columns={6} />
          ) : list.data && list.data.data.length === 0 ? (
            <EmptyState title="No consent records match" />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH>Channel</TH>
                    <TH>Purpose</TH>
                    <TH>Status</TH>
                    <TH>Effective</TH>
                    <TH>Withdrawn</TH>
                    <TH>Source</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.data?.data.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link href={`/customers/${row.customer.customerCode}`} className="font-medium text-primary hover:underline">
                          {row.customer.firstName} {row.customer.lastName}
                        </Link>
                        <span className="block font-mono text-2xs text-muted-foreground">{row.customer.customerCode}</span>
                      </TD>
                      <TD className="text-xs">{row.channel}</TD>
                      <TD className="text-xs">{titleCase(row.purpose)}</TD>
                      <TD>
                        <Badge variant={statusVariant(row.status)}>{titleCase(row.status)}</Badge>
                      </TD>
                      <TD className="text-2xs text-muted-foreground">{formatDateTime(row.effectiveFrom)}</TD>
                      <TD className="text-2xs text-muted-foreground">{row.withdrawnAt ? formatDateTime(row.withdrawnAt) : '—'}</TD>
                      <TD className="text-2xs">{row.source}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination meta={list.data?.meta} onPageChange={setPage} disabled={list.loading} />
            </>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Marketing consent by channel (current state)</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Channel</TH>
              <TH>Granted</TH>
              <TH>Withdrawn</TH>
              <TH>Pending</TH>
              <TH>Grant rate</TH>
            </TR>
          </THead>
          <TBody>
            {(summary.data?.data.byChannel ?? []).map((row) => {
              const total = row.granted + row.withdrawn + row.pending;
              return (
                <TR key={row.channel}>
                  <TD className="text-xs font-medium">{row.channel}</TD>
                  <TD>{formatNumber(row.granted)}</TD>
                  <TD>{formatNumber(row.withdrawn)}</TD>
                  <TD>{formatNumber(row.pending)}</TD>
                  <TD>{total ? formatPercent((row.granted / total) * 100) : '—'}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
