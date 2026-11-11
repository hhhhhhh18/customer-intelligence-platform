import { AnalyticsRepository } from './analytics.repository';
import { prisma } from '../../db/prisma';

export class AnalyticsService {
  constructor(private readonly repo = new AnalyticsRepository()) {}

  async dashboard() {
    const [
      summary,
      segmentDistribution,
      purchaseTrend,
      rfmDistribution,
      recommendationDistribution,
      outcomePerformance,
      dataQualityScore,
      exceptionBreakdown,
      recentExceptions,
      topSegments,
      engagementTrend,
      support,
      run,
    ] = await Promise.all([
      this.repo.summary(),
      this.repo.segmentDistribution(),
      this.repo.purchaseTrend(12),
      this.repo.rfmDistribution(),
      this.repo.recommendationDistribution(),
      this.repo.outcomePerformance(),
      this.repo.dataQualityScore(),
      this.repo.exceptionBreakdown(),
      this.repo.recentExceptions(5),
      this.repo.topSegmentsByRevenue(5),
      this.repo.engagementTrend(6),
      this.repo.supportSummary(),
      this.repo.latestGenerationRun(),
    ]);

    const totalOutcomes = outcomePerformance.reduce((sum, row) => sum + row.success + row.failure + row.noResponse, 0);
    const successOutcomes = outcomePerformance.reduce((sum, row) => sum + row.success, 0);

    return {
      kpis: {
        totalCustomers: Number(summary.total_customers),
        totalOrders: Number(summary.total_orders),
        totalNetRevenue: Number(summary.total_net_revenue),
        activeCustomers: Number(summary.active_customers),
        dormantCustomers: Number(summary.dormant_customers),
        atRiskCustomers: Number(summary.at_risk),
        eligibleRecommendations: Number(summary.eligible_recs),
        suppressedRecommendations: Number(summary.suppressed_recs),
        totalRecommendations: Number(summary.total_recs),
        openExceptions: Number(summary.open_exceptions),
        engagementEvents: Number(summary.engagement_events),
        supportCases: Number(summary.support_cases),
        dataQualityScore,
        outcomeSuccessRate: totalOutcomes ? Number(((successOutcomes / totalOutcomes) * 100).toFixed(2)) : 0,
      },
      segmentDistribution,
      purchaseTrend,
      rfmDistribution,
      recommendationDistribution,
      outcomePerformance,
      exceptionBreakdown: exceptionBreakdown.map((row) => ({ category: row.category, count: row._count._all })),
      recentExceptions,
      topSegments,
      engagementTrend,
      supportSummary: support,
      dataset: run
        ? {
            profile: run.profile,
            seed: run.seed,
            referenceDate: run.referenceDate,
            customerCount: run.customerCount,
            orderCount: run.orderCount,
            eventCount: run.eventCount,
            datasetHash: run.datasetHash,
            loadedAt: run.startedAt,
          }
        : null,
    };
  }

  async volumes() {
    return this.repo.volumeStats();
  }

  async auditTrail(limit = 50) {
    return prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}

export const analyticsService = new AnalyticsService();
