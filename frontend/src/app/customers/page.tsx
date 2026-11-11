'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, Search, SlidersHorizontal } from 'lucide-react';
import { useApi, useDebounced } from '@/hooks/use-api';
import type { ApiEnvelope, CustomerRow, PagedEnvelope, Segment } from '@/types';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/common/pagination';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [segment, setSegment] = useState('');
  const [consent, setConsent] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [sortBy, setSortBy] = useState('netSpend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const segmentsQuery = useApi<ApiEnvelope<Segment[]>>('/segments');
  const params = useMemo(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
      segmentSlug: segment || undefined,
      consentStatus: consent || undefined,
      lifecycle: lifecycle || undefined,
      sortBy,
      sortDir,
    }),
    [page, debouncedSearch, segment, consent, lifecycle, sortBy, sortDir],
  );

  const { data, error, loading } = useApi<PagedEnvelope<CustomerRow>>('/customers', params);
  const resetsPage = () => setPage(1);

  const toggleSort = (column: string) => {
    if (sortBy === column) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(column);
      setSortDir('desc');
    }
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetsPage();
                }}
                placeholder="Name, email or CUS-000001"
                className="pl-8"
              />
            </div>
          </div>

          <div className="w-52">
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Segment
            </label>
            <Select
              value={segment}
              onChange={(event) => {
                setSegment(event.target.value);
                resetsPage();
              }}
            >
              <option value="">All segments</option>
              {(segmentsQuery.data?.data ?? []).map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name} ({item.customerCount})
                </option>
              ))}
            </Select>
          </div>

          <div className="w-40">
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Email consent
            </label>
            <Select
              value={consent}
              onChange={(event) => {
                setConsent(event.target.value);
                resetsPage();
              }}
            >
              <option value="">Any</option>
              <option value="GRANTED">Granted</option>
              <option value="WITHDRAWN">Withdrawn</option>
              <option value="NONE">No record</option>
            </Select>
          </div>

          <div className="w-36">
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lifecycle
            </label>
            <Select
              value={lifecycle}
              onChange={(event) => {
                setLifecycle(event.target.value);
                resetsPage();
              }}
            >
              <option value="">Any</option>
              <option value="ACTIVE">Active</option>
              <option value="DORMANT">Dormant</option>
              <option value="CHURNED">Churned</option>
            </Select>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {data ? `${formatNumber(data.meta.total)} customers` : 'Loading…'}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {error ? (
          <EmptyState variant="error" title="Could not load customers" description={error} />
        ) : loading ? (
          <TableSkeleton rows={10} columns={8} />
        ) : data && data.data.length === 0 ? (
          <EmptyState title="No customers match these filters" description="Adjust the search or filters above." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Email</TH>
                  <TH>Signed up</TH>
                  <TH className="cursor-pointer" onClick={() => toggleSort('totalOrders')}>
                    <span className="inline-flex items-center gap-1">
                      Orders <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TH>
                  <TH className="cursor-pointer" onClick={() => toggleSort('netSpend')}>
                    <span className="inline-flex items-center gap-1">
                      Net spend <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TH>
                  <TH>Last purchase</TH>
                  <TH>RFM</TH>
                  <TH>Segment</TH>
                  <TH>Consent</TH>
                </TR>
              </THead>
              <TBody>
                {data?.data.map((customer) => (
                  <TR key={customer.id}>
                    <TD>
                      <Link href={`/customers/${customer.customerCode}`} className="group block">
                        <span className="font-medium text-foreground group-hover:text-primary">
                          {customer.firstName} {customer.lastName}
                        </span>
                        <span className="block font-mono text-2xs text-muted-foreground">{customer.customerCode}</span>
                      </Link>
                    </TD>
                    <TD className="text-xs text-slate-600">{customer.email}</TD>
                    <TD className="text-xs text-muted-foreground">{formatDate(customer.signupDate)}</TD>
                    <TD>{formatNumber(customer.totalOrders)}</TD>
                    <TD className="font-medium">{formatCurrency(customer.netSpend)}</TD>
                    <TD className="text-xs text-muted-foreground">{formatDate(customer.lastPurchase)}</TD>
                    <TD>
                      {customer.rfmScore ? (
                        <span className="font-mono text-xs">
                          {customer.rScore}
                          {customer.fScore}
                          {customer.mScore}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD>
                      {customer.segmentName ? (
                        <Badge variant="secondary">{customer.segmentName}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </TD>
                    <TD>
                      <Badge variant={statusVariant(customer.consentStatus)}>
                        {customer.consentStatus === 'NONE' ? 'No record' : customer.consentStatus}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data?.meta} onPageChange={setPage} disabled={loading} />
          </>
        )}
      </Card>
    </div>
  );
}
