'use client';

import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  CircleDollarSign,
  Database,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  Users,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import type { ApiEnvelope, DashboardData } from '@/types';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { PageSection } from '@/components/common/page-section';
import { SegmentDonut } from '@/components/charts/segment-donut';
import { RevenueTrend, EngagementTrend } from '@/components/charts/revenue-trend';
import { RfmDistribution } from '@/components/charts/rfm-distribution';
import { ActionDistribution, OutcomePerformance } from '@/components/charts/action-distribution';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatCurrencyCompact, formatDateTime, formatNumber, formatPercent, titleCase } from '@/lib/utils';

export default function DashboardPage() {
  const { data, error, loading } = useApi<ApiEnvelope<DashboardData>>('/dashboard/summary');
  const dashboard = data?.data;

  if (error) {
    return <EmptyState variant="error" title="Could not load dashboard" description={error} />;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {loading || !dashboard
          ? Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-[86px] w-full" />)
          : [
              {
                label: 'Total customers',
                value: formatNumber(dashboard.kpis.totalCustomers),
                hint: `${formatNumber(dashboard.kpis.activeCustomers)} active · ${formatNumber(dashboard.kpis.dormantCustomers)} dormant`,
                icon: Users,
              },
              {
                label: 'Total orders',
                value: formatNumber(dashboard.kpis.totalOrders),
                hint: `${formatNumber(dashboard.kpis.engagementEvents)} engagement events`,
                icon: ShoppingCart,
              },
              {
                label: 'Net revenue',
                value: formatCurrencyCompact(dashboard.kpis.totalNetRevenue),
                hint: 'Returns and refunds deducted',
                icon: CircleDollarSign,
              },
              {
                label: 'At-risk customers',
                value: formatNumber(dashboard.kpis.atRiskCustomers),
                hint: 'At-risk, cannot-lose and hibernating',
                icon: TrendingDown,
                tone: 'warning' as const,
              },
              {
                label: 'Eligible actions',
                value: formatNumber(dashboard.kpis.eligibleRecommendations),
                hint: `${formatNumber(dashboard.kpis.suppressedRecommendations)} suppressed`,
                icon: Sparkles,
                tone: 'positive' as const,
              },
              {
                label: 'Suppressed actions',
                value: formatNumber(dashboard.kpis.suppressedRecommendations),
                hint: 'Consent, complaints or frequency cap',
                icon: Ban,
                tone: 'warning' as const,
              },
              {
                label: 'Open exceptions',
                value: formatNumber(dashboard.kpis.openExceptions),
                hint: 'Across 4 anomaly categories',
                icon: AlertTriangle,
                tone: dashboard.kpis.openExceptions > 0 ? ('critical' as const) : ('positive' as const),
              },
              {
                label: 'Data quality score',
                value: dashboard.kpis.dataQualityScore !== null ? formatPercent(dashboard.kpis.dataQualityScore) : '—',
                hint: 'Unexpected failures weighted',
                icon: BadgeCheck,
                tone: 'positive' as const,
              },
              {
                label: 'Outcome success rate',
                value: formatPercent(dashboard.kpis.outcomeSuccessRate),
                hint: 'Successful outcomes / recorded outcomes',
                icon: Activity,
              },
              {
                label: 'Support cases',
                value: formatNumber(dashboard.kpis.supportCases),
                hint: 'Service cost feeds segmentation',
                icon: Database,
              },
            ].map((kpi) => (
              <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} hint={kpi.hint} icon={kpi.icon} tone={kpi.tone} />
            ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PageSection title="Segment distribution" description="Active membership per segment" className="xl:col-span-1">
          {loading || !dashboard ? (
            <Skeleton className="m-5 h-[280px]" />
          ) : (
            <div className="px-2 py-3">
              <SegmentDonut data={dashboard.segmentDistribution} />
            </div>
          )}
        </PageSection>

        <PageSection
          title="Purchase trend"
          description="Monthly net revenue and order count, last 12 months"
          className="xl:col-span-2"
        >
          {loading || !dashboard ? (
            <Skeleton className="m-5 h-[280px]" />
          ) : (
            <div className="px-3 py-3">
              <RevenueTrend data={dashboard.purchaseTrend} />
            </div>
          )}
        </PageSection>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PageSection title="RFM distribution" description="Score distribution across recency, frequency and monetary">
          {loading || !dashboard ? <Skeleton className="m-5 h-[240px]" /> : <div className="p-3"><RfmDistribution data={dashboard.rfmDistribution} /></div>}
        </PageSection>

        <PageSection title="Recommendation distribution" description="Eligibility outcome by action">
          {loading || !dashboard ? <Skeleton className="m-5 h-[300px]" /> : <div className="p-3"><ActionDistribution data={dashboard.recommendationDistribution} /></div>}
        </PageSection>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PageSection title="Action outcome performance" description="Recorded outcomes by action" className="xl:col-span-2">
          {loading || !dashboard ? <Skeleton className="m-5 h-[300px]" /> : <div className="p-3"><OutcomePerformance data={dashboard.outcomePerformance} /></div>}
        </PageSection>

        <div className="space-y-4">
          <PageSection title="Engagement volume" description="Events per month">
            {loading || !dashboard ? <Skeleton className="m-5 h-[180px]" /> : <div className="p-3"><EngagementTrend data={dashboard.engagementTrend} /></div>}
          </PageSection>

          <PageSection title="Dataset" description="Reproducible source of every figure">
            {dashboard?.dataset ? (
              <dl className="space-y-2 px-5 py-4 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Profile</dt>
                  <dd className="font-medium">{dashboard.dataset.profile}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Seed</dt>
                  <dd className="font-mono">{dashboard.dataset.seed}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Reference date</dt>
                  <dd className="font-medium">{formatDateTime(dashboard.dataset.referenceDate)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Loaded</dt>
                  <dd className="font-medium">{formatDateTime(dashboard.dataset.loadedAt)}</dd>
                </div>
                <div className="border-t border-border pt-2">
                  <dt className="text-muted-foreground">Dataset hash</dt>
                  <dd className="mt-1 break-all font-mono text-2xs text-slate-600">{dashboard.dataset.datasetHash}</dd>
                </div>
              </dl>
            ) : (
              <EmptyState title="No generation run" description="Load a dataset to populate metrics." />
            )}
          </PageSection>
        </div>
      </div>

      <PageSection
        title="Recent exceptions"
        description="Latest detected anomalies with expected and actual values"
        actions={
          <Link href="/exceptions" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        }
      >
        {loading || !dashboard ? (
          <Skeleton className="m-5 h-32" />
        ) : dashboard.recentExceptions.length === 0 ? (
          <EmptyState title="No exceptions" description="Run the detectors from the Exceptions page." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Exception</TH>
                <TH>Category</TH>
                <TH>Severity</TH>
                <TH>Entity</TH>
                <TH>Customer</TH>
                <TH>Detected</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {dashboard.recentExceptions.map((exception) => (
                <TR key={exception.id}>
                  <TD className="font-mono text-xs">{exception.exceptionCode}</TD>
                  <TD>{titleCase(exception.category)}</TD>
                  <TD>
                    <Badge variant={statusVariant(exception.severity)}>{exception.severity}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">{exception.entityId}</TD>
                  <TD>{exception.customer?.customerCode ?? '—'}</TD>
                  <TD className="text-xs text-muted-foreground">{formatDateTime(exception.detectedAt)}</TD>
                  <TD>
                    <Badge variant={statusVariant(exception.status)}>{titleCase(exception.status)}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </PageSection>

      <PageSection title="Top segments by revenue" description="Net revenue attributed to customers in each segment">
        {loading || !dashboard ? (
          <Skeleton className="m-5 h-32" />
        ) : (
          <div className="divide-y divide-border">
            {dashboard.topSegments.map((segment) => (
              <div key={segment.slug} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{segment.name}</p>
                  <p className="text-2xs text-muted-foreground">{formatNumber(segment.customers)} customers</p>
                </div>
                <p className="text-sm font-semibold">{formatCurrency(segment.revenue)}</p>
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
