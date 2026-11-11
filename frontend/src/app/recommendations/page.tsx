'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Play, Search, Sparkles, X } from 'lucide-react';
import { useApi, useDebounced } from '@/hooks/use-api';
import { api, ApiError } from '@/services/api';
import type { ApiEnvelope, PagedEnvelope, RecommendationRow, Segment } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/common/pagination';
import { formatCurrency, formatDateTime, formatNumber, titleCase } from '@/lib/utils';

interface ActionCatalogRow {
  id: number;
  slug: string;
  name: string;
  isPromotional: boolean;
  requiresMarketingConsent: boolean;
  channel: string;
}

interface RecommendationDetail {
  id: number;
  recommendationCode: string;
  eligibility: string;
  suppressionResult: string;
  status: string;
  explanation: string;
  ruleVersion: string;
  recommendedAt: string;
  score: string;
  inputMetrics: Record<string, unknown>;
  action: ActionCatalogRow & { description: string };
  segment: { name: string } | null;
  customer: { customerCode: string; firstName: string; lastName: string; email: string };
  reasons: Array<{ reasonCode: string; label: string; detail: string; metricName: string | null; metricValue: string | null }>;
  outcomes: Array<{ outcomeCode: string; status: string; revenueAttributed: string }>;
}

export default function RecommendationsPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 350);
  const [segment, setSegment] = useState('');
  const [action, setAction] = useState('');
  const [eligibility, setEligibility] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<{ text: string; source: string } | null>(null);

  const segments = useApi<ApiEnvelope<Segment[]>>('/segments');
  const actions = useApi<ApiEnvelope<ActionCatalogRow[]>>('/actions');
  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      search: debounced || undefined,
      segmentSlug: segment || undefined,
      actionSlug: action || undefined,
      eligibility: eligibility || undefined,
    }),
    [page, debounced, segment, action, eligibility],
  );
  const list = useApi<PagedEnvelope<RecommendationRow>>('/recommendations', params);
  const detail = useApi<ApiEnvelope<RecommendationDetail>>(selectedId ? `/recommendations/${selectedId}` : null);

  const runEngine = async () => {
    setRunning(true);
    setRunError(null);
    setRunMessage(null);
    try {
      const result = await api.post<
        ApiEnvelope<{ runCode: string; processed: number; eligible: number; suppressed: number; noAction: number; consentSuppressed: number }>
      >('/recommendations/run', { actor: 'web-console' });
      setRunMessage(
        `${result.data.runCode}: ${formatNumber(result.data.processed)} evaluated · ${formatNumber(
          result.data.eligible,
        )} eligible · ${formatNumber(result.data.suppressed)} suppressed (${result.data.consentSuppressed} consent) · ${formatNumber(
          result.data.noAction,
        )} no-action`,
      );
      list.refresh();
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'Recommendation run failed');
    } finally {
      setRunning(false);
    }
  };

  const explain = async () => {
    if (!selectedId) return;
    try {
      const result = await api.post<ApiEnvelope<{ explanation: string; source: string }>>(`/recommendations/${selectedId}/explain`);
      setNarrative({ text: result.data.explanation, source: result.data.source });
    } catch {
      setNarrative(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Rule version nba-v1.0.0</Badge>
          <Badge variant="outline">Consent evaluated first</Badge>
        </div>
        <Button onClick={runEngine} disabled={running}>
          <Play className="h-3.5 w-3.5" /> {running ? 'Running…' : 'Run recommendation engine'}
        </Button>
      </div>

      {runMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">{runMessage}</div>
      ) : null}
      {runError ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{runError}</div> : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Customer name, code or email"
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-48">
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Segment</label>
            <Select
              value={segment}
              onChange={(event) => {
                setSegment(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All segments</option>
              {(segments.data?.data ?? []).map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-48">
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Action</label>
            <Select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All actions</option>
              {(actions.data?.data ?? []).map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Eligibility</label>
            <Select
              value={eligibility}
              onChange={(event) => {
                setEligibility(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Any</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="SUPPRESSED">Suppressed</option>
              <option value="NO_ACTION">No action</option>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{list.data ? `${formatNumber(list.data.meta.total)} recommendations` : 'Loading…'}</p>
        </div>
      </Card>

      <div className={selectedId ? 'grid grid-cols-1 gap-4 xl:grid-cols-5' : ''}>
        <Card className={selectedId ? 'overflow-hidden xl:col-span-3' : 'overflow-hidden'}>
          {list.error ? (
            <EmptyState variant="error" title="Could not load recommendations" description={list.error} />
          ) : list.loading ? (
            <TableSkeleton rows={10} columns={7} />
          ) : list.data && list.data.data.length === 0 ? (
            <EmptyState title="No recommendations match" description="Run the engine or clear the filters." />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH>Action</TH>
                    <TH>Segment</TH>
                    <TH>Eligibility</TH>
                    <TH>Suppression</TH>
                    <TH>Recommended</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.data?.data.map((row) => (
                    <TR
                      key={row.id}
                      onClick={() => {
                        setSelectedId(row.id);
                        setNarrative(null);
                      }}
                      className={`cursor-pointer ${selectedId === row.id ? 'bg-accent/60' : ''}`}
                    >
                      <TD>
                        <span className="font-medium">
                          {row.customer.firstName} {row.customer.lastName}
                        </span>
                        <span className="block font-mono text-2xs text-muted-foreground">{row.customer.customerCode}</span>
                      </TD>
                      <TD>
                        <span className="text-xs font-medium">{row.action.name}</span>
                        {row.action.isPromotional ? <Badge variant="warning" className="ml-1.5">Promo</Badge> : null}
                      </TD>
                      <TD className="text-xs">{row.segment?.name ?? '—'}</TD>
                      <TD>
                        <Badge variant={statusVariant(row.eligibility)}>{titleCase(row.eligibility)}</Badge>
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        {row.suppressionResult === 'NOT_SUPPRESSED' ? '—' : titleCase(row.suppressionResult.replace('SUPPRESSED_', ''))}
                      </TD>
                      <TD className="text-2xs text-muted-foreground">{formatDateTime(row.recommendedAt)}</TD>
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
                <CardTitle>Recommendation explanation</CardTitle>
                <p className="mt-0.5 font-mono text-2xs text-muted-foreground">
                  {detail.data?.data.recommendationCode ?? 'Loading…'}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {detail.loading || !detail.data ? (
                <div className="space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-20 w-full animate-pulse rounded bg-slate-200" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{detail.data.data.action.name}</Badge>
                    <Badge variant={statusVariant(detail.data.data.eligibility)}>{titleCase(detail.data.data.eligibility)}</Badge>
                    <Badge variant="outline">{detail.data.data.action.channel}</Badge>
                    {detail.data.data.action.requiresMarketingConsent ? <Badge variant="info">Needs consent</Badge> : null}
                  </div>

                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                    <Link
                      href={`/customers/${detail.data.data.customer.customerCode}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {detail.data.data.customer.firstName} {detail.data.data.customer.lastName} ·{' '}
                      {detail.data.data.customer.customerCode}
                    </Link>
                    <p className="text-2xs text-muted-foreground">{detail.data.data.customer.email}</p>
                  </div>

                  <div className="rounded-md bg-secondary/60 p-3">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Decision</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">{detail.data.data.explanation}</p>
                  </div>

                  {narrative ? (
                    <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-indigo-700">
                        Narrative ({narrative.source === 'llm' ? 'LLM-assisted' : 'deterministic fallback'})
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-700">{narrative.text}</p>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Reasons</p>
                    <ul className="mt-2 space-y-2">
                      {detail.data.data.reasons.map((reason) => (
                        <li key={reason.reasonCode} className="rounded-md border border-border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium">{reason.label}</span>
                            <span className="font-mono text-2xs text-muted-foreground">{reason.reasonCode}</span>
                          </div>
                          <p className="mt-0.5 text-2xs leading-relaxed text-slate-600">{reason.detail}</p>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Input metrics</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-2xs">
                      {Object.entries(detail.data.data.inputMetrics).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-2 border-b border-dashed border-border pb-1">
                          <dt className="text-muted-foreground">{key}</dt>
                          <dd className="text-right font-medium text-slate-700">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {detail.data.data.outcomes.length > 0 ? (
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Outcomes</p>
                      {detail.data.data.outcomes.map((outcome) => (
                        <p key={outcome.outcomeCode} className="mt-1 text-xs">
                          <span className="font-mono text-2xs">{outcome.outcomeCode}</span>{' '}
                          <Badge variant={statusVariant(outcome.status)}>{outcome.status}</Badge>{' '}
                          {formatCurrency(outcome.revenueAttributed)}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <Button variant="outline" size="sm" onClick={explain} className="w-full">
                    <Sparkles className="h-3.5 w-3.5" /> Generate business narrative
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

