'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, MapPin, Phone } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import type { ApiEnvelope } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatDate, formatDateTime, formatNumber, titleCase } from '@/lib/utils';

interface CustomerDetail {
  customer: {
    customerCode: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    city: string;
    region: string;
    country: string;
    signupDate: string;
    birthDate: string | null;
    lifecycle: string;
    acquisition: string;
    preferredChannel: string | null;
  };
  metrics: {
    totalOrders: number;
    netSpend: number;
    refunds: number;
    returnCount: number;
    lastPurchase: string | null;
    lifetimeValueBand: string;
  };
  rfm: {
    rScore: number;
    fScore: number;
    mScore: number;
    rfmScore: number;
    recencyDays: number;
    frequency: number;
    monetary: number;
    serviceCost: number;
    assignmentReason: string;
    assignedAt: string;
    ruleVersion: string;
  } | null;
  segment: { name: string; slug: string; segmentCode: string; membershipCode: string; conflictingMemberships: boolean } | null;
  membershipHistory: Array<{
    id: number;
    membershipCode: string;
    status: string;
    rfmScore: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    ruleVersion: string;
    segment: { name: string; slug: string };
  }>;
  orders: Array<{
    id: number;
    orderCode: string;
    orderDate: string;
    status: string;
    channel: string;
    grossTotal: string;
    returnedAmount: string;
    netTotal: string;
    itemCount: number;
    orderLines: Array<{ id: number; quantity: number; lineTotal: string; refundAmount: string; product: { name: string } }>;
  }>;
  engagement: Array<{ id: string; eventType: string; channel: string; occurredAt: string; pagePath: string | null; campaignId: string | null }>;
  supportCases: Array<{
    id: number;
    caseCode: string;
    openedAt: string;
    status: string;
    priority: string;
    category: string;
    subject: string;
    handlingCost: string;
    isEscalated: boolean;
  }>;
  consents: Array<{
    id: number;
    consentCode: string;
    channel: string;
    purpose: string;
    status: string;
    source: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    withdrawnAt: string | null;
    notes: string | null;
  }>;
  contactPreferences: { preferredChannel: string | null; emailMarketing: string; reachableChannels: string[] };
  recommendations: Array<{
    id: number;
    recommendationCode: string;
    eligibility: string;
    suppressionResult: string;
    status: string;
    explanation: string;
    recommendedAt: string;
    action: { name: string; slug: string; channel: string };
    segment: { name: string } | null;
    reasons: Array<{ reasonCode: string; label: string; detail: string }>;
    outcomes: Array<{ outcomeCode: string; status: string; revenueAttributed: string }>;
  }>;
  exceptions: Array<{
    id: number;
    exceptionCode: string;
    category: string;
    severity: string;
    status: string;
    explanation: string;
    detectedAt: string;
  }>;
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading } = useApi<ApiEnvelope<CustomerDetail>>(`/customers/${id}`);
  const detail = data?.data;

  if (error) return <EmptyState variant="error" title="Could not load customer" description={error} />;
  if (loading || !detail) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { customer, metrics, rfm, segment } = detail;

  return (
    <div className="space-y-4">
      <Link href="/customers" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to customers
      </Link>

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-6 pt-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">
                {customer.firstName} {customer.lastName}
              </h2>
              <Badge variant="secondary" className="font-mono">
                {customer.customerCode}
              </Badge>
              <Badge variant={statusVariant(customer.lifecycle)}>{titleCase(customer.lifecycle)}</Badge>
              {segment ? <Badge>{segment.name}</Badge> : <Badge variant="muted">Unassigned</Badge>}
              {segment?.conflictingMemberships ? <Badge variant="destructive">Segment conflict</Badge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5 text-slate-400" /> {customer.email}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5 text-slate-400" /> {customer.phone ?? 'No phone'}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-slate-400" /> {customer.city}, {customer.region}, {customer.country}
              </span>
            </div>
            <p className="text-2xs text-muted-foreground">
              Signed up {formatDate(customer.signupDate)} · acquired via {titleCase(customer.acquisition)} · preferred channel{' '}
              {customer.preferredChannel ?? 'unknown'} · email marketing{' '}
              <span className={detail.contactPreferences.emailMarketing === 'GRANTED' ? 'text-emerald-600' : 'text-red-600'}>
                {detail.contactPreferences.emailMarketing}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-2xs uppercase tracking-wider text-muted-foreground">Orders</p>
              <p className="font-semibold">{formatNumber(metrics.totalOrders)}</p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wider text-muted-foreground">Net spend</p>
              <p className="font-semibold">{formatCurrency(metrics.netSpend)}</p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wider text-muted-foreground">Refunded</p>
              <p className="font-semibold">{formatCurrency(metrics.refunds)}</p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wider text-muted-foreground">Last purchase</p>
              <p className="font-semibold">{formatDate(metrics.lastPurchase)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="purchases">Purchases ({detail.orders.length})</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="support">Support ({detail.supportCases.length})</TabsTrigger>
          <TabsTrigger value="consent">Consent ({detail.consents.length})</TabsTrigger>
          <TabsTrigger value="actions">Recommendations ({detail.recommendations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>RFM analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {rfm ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Recency', score: rfm.rScore, detail: `${rfm.recencyDays} days ago` },
                        { label: 'Frequency', score: rfm.fScore, detail: `${rfm.frequency} orders` },
                        { label: 'Monetary', score: rfm.mScore, detail: formatCurrency(rfm.monetary) },
                      ].map((item) => (
                        <div key={item.label} className="rounded-md border border-border p-3">
                          <p className="text-2xs uppercase tracking-wider text-muted-foreground">{item.label}</p>
                          <p className="mt-1 text-2xl font-semibold text-primary">{item.score}</p>
                          <p className="text-2xs text-muted-foreground">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-md bg-secondary/60 p-3">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Assignment explanation
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-700">{rfm.assignmentReason}</p>
                      <p className="mt-2 text-2xs text-muted-foreground">
                        Rule {rfm.ruleVersion} · assigned {formatDateTime(rfm.assignedAt)} · service cost{' '}
                        {formatCurrency(rfm.serviceCost)}
                      </p>
                    </div>
                  </>
                ) : (
                  <EmptyState title="No active segmentation yet" description="Run segmentation to score this customer." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Segment history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {detail.membershipHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No memberships recorded.</p>
                ) : (
                  detail.membershipHistory.map((membership) => (
                    <div key={membership.id} className="rounded-md border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium">{membership.segment.name}</p>
                        <Badge variant={statusVariant(membership.status)}>{membership.status}</Badge>
                      </div>
                      <p className="mt-1 font-mono text-2xs text-muted-foreground">{membership.membershipCode}</p>
                      <p className="text-2xs text-muted-foreground">
                        {formatDate(membership.effectiveFrom)} → {membership.effectiveTo ? formatDate(membership.effectiveTo) : 'present'}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {detail.exceptions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Exceptions involving this customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {detail.exceptions.map((exception) => (
                  <div key={exception.id} className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(exception.severity)}>{exception.severity}</Badge>
                      <span className="text-xs font-medium">{titleCase(exception.category)}</span>
                      <span className="font-mono text-2xs text-muted-foreground">{exception.exceptionCode}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{exception.explanation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="purchases">
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH>Channel</TH>
                  <TH>Items</TH>
                  <TH>Gross</TH>
                  <TH>Returned</TH>
                  <TH>Net</TH>
                </TR>
              </THead>
              <TBody>
                {detail.orders.map((order) => (
                  <TR key={order.id}>
                    <TD className="font-mono text-xs">{order.orderCode}</TD>
                    <TD className="text-xs text-muted-foreground">{formatDate(order.orderDate)}</TD>
                    <TD>
                      <Badge variant={statusVariant(order.status)}>{titleCase(order.status)}</Badge>
                    </TD>
                    <TD className="text-xs">{titleCase(order.channel)}</TD>
                    <TD>{order.itemCount}</TD>
                    <TD>{formatCurrency(order.grossTotal)}</TD>
                    <TD className={Number(order.returnedAmount) > 0 ? 'text-red-600' : 'text-muted-foreground'}>
                      {formatCurrency(order.returnedAmount)}
                    </TD>
                    <TD className="font-medium">{formatCurrency(order.netTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="engagement">
          <Card>
            <CardContent className="pt-4">
              <ol className="relative space-y-4 border-l border-border pl-4">
                {detail.engagement.map((event) => (
                  <li key={String(event.id)} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium">{titleCase(event.eventType)}</p>
                      <Badge variant="muted">{event.channel}</Badge>
                      <span className="text-2xs text-muted-foreground">{formatDateTime(event.occurredAt)}</span>
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      {event.pagePath ?? '—'}
                      {event.campaignId ? ` · ${event.campaignId}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
              {detail.engagement.length === 0 ? <EmptyState title="No engagement events" /> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support">
          <Card className="overflow-hidden">
            {detail.supportCases.length === 0 ? (
              <EmptyState title="No support cases" description="This customer has not contacted support." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Case</TH>
                    <TH>Opened</TH>
                    <TH>Status</TH>
                    <TH>Priority</TH>
                    <TH>Category</TH>
                    <TH>Subject</TH>
                    <TH>Handling cost</TH>
                  </TR>
                </THead>
                <TBody>
                  {detail.supportCases.map((supportCase) => (
                    <TR key={supportCase.id}>
                      <TD className="font-mono text-xs">{supportCase.caseCode}</TD>
                      <TD className="text-xs text-muted-foreground">{formatDate(supportCase.openedAt)}</TD>
                      <TD>
                        <Badge variant={statusVariant(supportCase.status)}>{titleCase(supportCase.status)}</Badge>
                      </TD>
                      <TD className="text-xs">{supportCase.priority}</TD>
                      <TD className="text-xs">{titleCase(supportCase.category)}</TD>
                      <TD className="text-xs">{supportCase.subject}</TD>
                      <TD>{formatCurrency(supportCase.handlingCost)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="consent">
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR>
                  <TH>Consent</TH>
                  <TH>Channel</TH>
                  <TH>Purpose</TH>
                  <TH>Status</TH>
                  <TH>Effective from</TH>
                  <TH>Effective to</TH>
                  <TH>Source</TH>
                </TR>
              </THead>
              <TBody>
                {detail.consents.map((consent) => (
                  <TR key={consent.id}>
                    <TD className="font-mono text-xs">{consent.consentCode}</TD>
                    <TD className="text-xs">{consent.channel}</TD>
                    <TD className="text-xs">{titleCase(consent.purpose)}</TD>
                    <TD>
                      <Badge variant={statusVariant(consent.status)}>{titleCase(consent.status)}</Badge>
                    </TD>
                    <TD className="text-xs text-muted-foreground">{formatDateTime(consent.effectiveFrom)}</TD>
                    <TD className="text-xs text-muted-foreground">
                      {consent.effectiveTo ? formatDateTime(consent.effectiveTo) : 'current'}
                    </TD>
                    <TD className="text-xs">{consent.source}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <div className="space-y-3">
            {detail.recommendations.length === 0 ? (
              <Card>
                <EmptyState title="No recommendations" description="Run the recommendation engine to evaluate this customer." />
              </Card>
            ) : (
              detail.recommendations.map((recommendation) => (
                <Card key={recommendation.id}>
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-2xs text-muted-foreground">{recommendation.recommendationCode}</span>
                      <Badge>{recommendation.action.name}</Badge>
                      <Badge variant={statusVariant(recommendation.eligibility)}>{titleCase(recommendation.eligibility)}</Badge>
                      {recommendation.suppressionResult !== 'NOT_SUPPRESSED' ? (
                        <Badge variant="warning">{titleCase(recommendation.suppressionResult)}</Badge>
                      ) : null}
                      <span className="ml-auto text-2xs text-muted-foreground">
                        {formatDateTime(recommendation.recommendedAt)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-700">{recommendation.explanation}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {recommendation.reasons.map((reason) => (
                        <span
                          key={reason.reasonCode}
                          title={reason.detail}
                          className="rounded-full bg-secondary px-2 py-0.5 text-2xs text-slate-600"
                        >
                          {reason.label}
                        </span>
                      ))}
                    </div>
                    {recommendation.outcomes.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                        {recommendation.outcomes.map((outcome) => (
                          <span key={outcome.outcomeCode} className="text-2xs text-muted-foreground">
                            {outcome.outcomeCode} · <Badge variant={statusVariant(outcome.status)}>{outcome.status}</Badge> ·{' '}
                            {formatCurrency(outcome.revenueAttributed)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
