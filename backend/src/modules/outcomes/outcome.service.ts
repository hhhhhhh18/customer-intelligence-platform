import { prisma, Prisma } from '../../db/prisma';
import { outcomeCode } from '../../utils/ids';
import { logger } from '../../utils/logger';
import { pickWeighted, seededRandom } from '../../utils/prng';
import { auditService } from '../audit/audit.service';

/**
 * Outcome simulation is deterministic and seeded, but it is *not* a business
 * rule: it fabricates the downstream response for demo purposes.  Every
 * outcome is stored against a real recommendation, customer and action, and
 * revenue is only attributed to successful completions.
 */
const ACCEPT_RATE: Record<string, number> = {
  LOYALTY_REWARD: 0.48,
  PROMOTIONAL_DISCOUNT: 0.31,
  RE_ENGAGEMENT: 0.19,
  WELCOME_ONBOARDING: 0.52,
  PRODUCT_RECOMMENDATION: 0.34,
  RETENTION_INTERVENTION: 0.44,
  SUPPORT_FOLLOW_UP: 0.72,
  NO_ACTION: 0,
};

const SUCCESS_GIVEN_ACCEPTED: Record<string, number> = {
  LOYALTY_REWARD: 0.58,
  PROMOTIONAL_DISCOUNT: 0.42,
  RE_ENGAGEMENT: 0.24,
  WELCOME_ONBOARDING: 0.46,
  PRODUCT_RECOMMENDATION: 0.28,
  RETENTION_INTERVENTION: 0.52,
  SUPPORT_FOLLOW_UP: 0.78,
  NO_ACTION: 0,
};

const BASE_REVENUE_INR: Record<string, number> = {
  LOYALTY_REWARD: 3500,
  PROMOTIONAL_DISCOUNT: 2200,
  RE_ENGAGEMENT: 1800,
  WELCOME_ONBOARDING: 1500,
  PRODUCT_RECOMMENDATION: 1200,
  RETENTION_INTERVENTION: 6500,
  SUPPORT_FOLLOW_UP: 900,
  NO_ACTION: 0,
};

export interface OutcomeSimulationSummary {
  evaluated: number;
  created: number;
  skippedExisting: number;
  success: number;
  failure: number;
  noResponse: number;
  revenueAttributed: number;
  durationMs: number;
}

export class OutcomeService {
  async simulate(options: { seed?: number; actor?: string } = {}): Promise<OutcomeSimulationSummary> {
    const startedAt = Date.now();
    const seed = options.seed ?? Number(process.env.DATA_SEED ?? 20261022);

    const recommendations = await prisma.recommendation.findMany({
      where: { eligibility: 'ELIGIBLE' },
      select: {
        id: true,
        customerId: true,
        actionId: true,
        recommendedAt: true,
        eligibility: true,
        inputMetrics: true,
        action: { select: { actionType: true, channel: true, slug: true } },
        outcomes: { select: { id: true } },
      },
      orderBy: { id: 'asc' },
    });

    if (!recommendations.length) {
      throw new Error('No eligible recommendations found - run the recommendation engine first');
    }

    const existing = recommendations.filter((r) => r.outcomes.length > 0);
    const pending = recommendations.filter((r) => r.outcomes.length === 0);

    const rows: Prisma.ActionOutcomeCreateManyInput[] = [];
    const statusUpdates: Array<{ id: number; status: 'ACCEPTED' | 'COMPLETED' | 'EXPIRED' }> = [];
    let sequence = await this.nextOutcomeSequence();
    let success = 0;
    let failure = 0;
    let noResponse = 0;
    let revenue = 0;

    for (const rec of pending) {
      const random = seededRandom(seed, `outcome:${rec.id}`);
      const acceptRate = ACCEPT_RATE[rec.action.actionType] ?? 0.3;
      const accepted = random() < acceptRate;

      let status: 'SUCCESS' | 'FAILURE' | 'NO_RESPONSE';
      let respondedAt: Date | null = null;
      let completedAt: Date | null = null;
      let revenueAttributed = 0;

      if (!accepted) {
        status = 'NO_RESPONSE';
        noResponse += 1;
      } else {
        respondedAt = new Date(rec.recommendedAt.getTime() + (1 + Math.floor(random() * 3)) * 86_400_000);
        completedAt = new Date(respondedAt.getTime() + (3 + Math.floor(random() * 17)) * 86_400_000);
        const successRate = SUCCESS_GIVEN_ACCEPTED[rec.action.actionType] ?? 0.3;
        if (random() < successRate) {
          status = 'SUCCESS';
          success += 1;
          const metrics = (rec.inputMetrics ?? {}) as Record<string, number>;
          const mScore = Number(metrics.mScore ?? 3);
          const base = BASE_REVENUE_INR[rec.action.actionType] ?? 1000;
          const amount = base * (0.6 + mScore / 5) * (0.85 + random() * 0.4);
          revenueAttributed = Math.round(amount * 100) / 100;
          revenue += revenueAttributed;
        } else {
          status = 'FAILURE';
          failure += 1;
        }
      }

      rows.push({
        outcomeCode: outcomeCode(sequence++),
        recommendationId: rec.id,
        customerId: rec.customerId,
        actionId: rec.actionId,
        status,
        respondedAt,
        completedAt,
        revenueAttributed: new Prisma.Decimal(revenueAttributed),
        channel: rec.action.channel,
        notes:
          status === 'NO_RESPONSE'
            ? 'No response within the 14-day attribution window.'
            : `Downstream ${rec.action.slug} outcome recorded by campaign service.`,
        isAttributionValid: true,
      });

      statusUpdates.push({
        id: rec.id,
        status: status === 'NO_RESPONSE' ? 'EXPIRED' : status === 'SUCCESS' || status === 'FAILURE' ? 'COMPLETED' : 'ACCEPTED',
      });
    }

    if (rows.length) {
      const chunk = 2000;
      for (let i = 0; i < rows.length; i += chunk) {
        await prisma.actionOutcome.createMany({ data: rows.slice(i, i + chunk) });
      }
      // Recommendation lifecycle is derived from the recorded outcome.
      const byStatus = new Map<string, number[]>();
      for (const update of statusUpdates) {
        const list = byStatus.get(update.status) ?? [];
        list.push(update.id);
        byStatus.set(update.status, list);
      }
      for (const [status, ids] of byStatus) {
        for (let i = 0; i < ids.length; i += 5000) {
          await prisma.recommendation.updateMany({
            where: { id: { in: ids.slice(i, i + 5000) } },
            data: { status: status as never },
          });
        }
      }
    }

    await auditService.record({
      actor: options.actor ?? 'system',
      action: 'OUTCOME_SIMULATION',
      entityType: 'ActionOutcome',
      entityId: `sim-${startedAt}`,
      payload: { evaluated: pending.length, created: rows.length, success, failure, noResponse, seed },
    });

    logger.info('outcome simulation completed', { created: rows.length, success, failure, noResponse });

    return {
      evaluated: recommendations.length,
      created: rows.length,
      skippedExisting: existing.length,
      success,
      failure,
      noResponse,
      revenueAttributed: Number(revenue.toFixed(2)),
      durationMs: Date.now() - startedAt,
    };
  }

  private async nextOutcomeSequence(): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ max: number | null }>>`
      SELECT COALESCE(MAX(CAST(SUBSTRING("outcomeCode" FROM 6) AS INTEGER)), 0) AS max FROM action_outcomes
    `;
    return Number(rows[0]?.max ?? 0) + 1;
  }

  async list(filters: { status?: string; actionSlug?: string; segmentSlug?: string }, skip: number, take: number) {
    const where: Prisma.ActionOutcomeWhereInput = {};
    if (filters.status) where.status = filters.status as Prisma.EnumOutcomeStatusFilter;
    if (filters.actionSlug) where.action = { slug: filters.actionSlug };
    if (filters.segmentSlug) where.recommendation = { segment: { slug: filters.segmentSlug } };

    const [total, rows] = await Promise.all([
      prisma.actionOutcome.count({ where }),
      prisma.actionOutcome.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          customer: { select: { customerCode: true, firstName: true, lastName: true } },
          action: { select: { name: true, slug: true, actionType: true } },
          recommendation: {
            select: {
              recommendationCode: true,
              actionId: true,
              eligibility: true,
              segment: { select: { name: true, slug: true } },
            },
          },
        },
      }),
    ]);
    return { total, rows, page: { page: Math.floor(skip / take) + 1, pageSize: take, total } };
  }

  /**
   * Records an outcome coming from a downstream system.  If the recorded action
   * does not match the recommendation's action, the row is still stored (the
   * evidence is preserved) but flagged invalid and an exception is raised.
   */
  async record(input: {
    recommendationCode: string;
    actionSlug: string;
    status: 'SUCCESS' | 'FAILURE' | 'NO_RESPONSE' | 'PENDING';
    revenueAttributed?: number;
    channel: string;
    notes?: string;
    respondedAt?: string;
  }) {
    const recommendation = await prisma.recommendation.findUnique({
      where: { recommendationCode: input.recommendationCode },
      include: { action: true },
    });
    if (!recommendation) throw new Error(`Recommendation ${input.recommendationCode} not found`);

    const action = await prisma.actionCatalog.findUnique({ where: { slug: input.actionSlug } });
    if (!action) throw new Error(`Action ${input.actionSlug} not found`);

    const mismatch = action.id !== recommendation.actionId;
    const sequence = await this.nextOutcomeSequence();
    const now = new Date();

    const created = await prisma.actionOutcome.create({
      data: {
        outcomeCode: outcomeCode(sequence),
        recommendationId: recommendation.id,
        customerId: recommendation.customerId,
        actionId: action.id,
        status: input.status,
        respondedAt: input.respondedAt ? new Date(input.respondedAt) : null,
        completedAt: input.status === 'SUCCESS' || input.status === 'FAILURE' ? now : null,
        revenueAttributed: new Prisma.Decimal(input.revenueAttributed ?? 0),
        channel: input.channel as never,
        notes: input.notes ?? null,
        isAttributionValid: !mismatch,
      },
    });

    if (mismatch) {
      await prisma.exceptionRecord.create({
        data: {
          exceptionCode: `EXC-${String(Date.now()).slice(-6)}`,
          category: 'OUTCOME_ATTRIBUTION',
          severity: 'HIGH',
          entityType: 'ActionOutcome',
          entityId: created.outcomeCode,
          customerId: recommendation.customerId,
          recommendationId: recommendation.id,
          expectedValue: recommendation.action.slug,
          actualValue: action.slug,
          explanation: `Outcome action "${action.slug}" does not match the action "${recommendation.action.slug}" of recommendation ${recommendation.recommendationCode}. Revenue cannot be attributed to the recommendation until corrected.`,
          detectionRuleId: 'ATTRIB-01',
          evidence: { recordedActionId: action.id, recommendationActionId: recommendation.actionId } as Prisma.InputJsonValue,
        },
      });
      await auditService.record({
        actor: 'outcome-api',
        action: 'OUTCOME_ATTRIBUTION_MISMATCH',
        entityType: 'ActionOutcome',
        entityId: created.outcomeCode,
        customerId: recommendation.customerId,
        payload: { recommendationCode: recommendation.recommendationCode, recordedAction: action.slug, expectedAction: recommendation.action.slug },
      });
    }

    return { outcome: created, mismatch };
  }

  async metrics() {
    const [statusCounts, revenue, segmentPerformance, actionPerformance, eligibleCount, acceptedCount, completedCount] =
      await Promise.all([
        prisma.actionOutcome.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.actionOutcome.aggregate({
          where: { status: 'SUCCESS' },
          _sum: { revenueAttributed: true },
        }),
        prisma.$queryRaw<Array<{ segment: string; slug: string; outcomes: number; successes: number; revenue: string }>>`
          SELECT s.name AS segment, s.slug AS slug,
                 COUNT(o.id)::int AS outcomes,
                 COUNT(*) FILTER (WHERE o.status = 'SUCCESS')::int AS successes,
                 COALESCE(SUM(o."revenueAttributed") FILTER (WHERE o.status = 'SUCCESS'), 0) AS revenue
          FROM action_outcomes o
          JOIN recommendations r ON r.id = o."recommendationId"
          LEFT JOIN segment_rules s ON s.id = r."segmentId"
          GROUP BY s.name, s.slug
          ORDER BY revenue DESC
        `,
        prisma.$queryRaw<Array<{ action: string; slug: string; outcomes: number; successes: number; revenue: string }>>`
          SELECT a.name AS action, a.slug AS slug,
                 COUNT(o.id)::int AS outcomes,
                 COUNT(*) FILTER (WHERE o.status = 'SUCCESS')::int AS successes,
                 COALESCE(SUM(o."revenueAttributed") FILTER (WHERE o.status = 'SUCCESS'), 0) AS revenue
          FROM action_outcomes o
          JOIN action_catalog a ON a.id = o."actionId"
          GROUP BY a.name, a.slug
          ORDER BY revenue DESC
        `,
        prisma.recommendation.count({ where: { eligibility: 'ELIGIBLE' } }),
        prisma.actionOutcome.count({ where: { status: 'SUCCESS' } }),
        prisma.recommendation.count({ where: { status: 'COMPLETED' } }),
      ]);

    const totalOutcomes = statusCounts.reduce((sum, row) => sum + row._count._all, 0);
    const byStatus = Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all]));
    const successCount = byStatus.SUCCESS ?? 0;
    const failureCount = byStatus.FAILURE ?? 0;
    const noResponse = byStatus.NO_RESPONSE ?? 0;
    const accepted = successCount + failureCount;

    return {
      totalOutcomes,
      byStatus: {
        success: successCount,
        failure: failureCount,
        noResponse,
        pending: byStatus.PENDING ?? 0,
      },
      eligibleRecommendations: eligibleCount,
      acceptedActions: accepted,
      completedActions: completedCount,
      conversionRate: eligibleCount ? Number(((successCount / eligibleCount) * 100).toFixed(2)) : 0,
      acceptanceRate: totalOutcomes ? Number(((accepted / totalOutcomes) * 100).toFixed(2)) : 0,
      outcomeSuccessRate: accepted ? Number(((successCount / accepted) * 100).toFixed(2)) : 0,
      revenueAttributed: Number(revenue._sum.revenueAttributed ?? 0),
      segmentPerformance: segmentPerformance.map((row) => ({
        segment: row.segment ?? 'Unassigned',
        slug: row.slug ?? 'unassigned',
        outcomes: Number(row.outcomes),
        successes: Number(row.successes),
        revenue: Number(row.revenue),
        successRate: Number(row.outcomes) ? Number(((Number(row.successes) / Number(row.outcomes)) * 100).toFixed(2)) : 0,
      })),
      actionPerformance: actionPerformance.map((row) => ({
        action: row.action,
        slug: row.slug,
        outcomes: Number(row.outcomes),
        successes: Number(row.successes),
        revenue: Number(row.revenue),
        successRate: Number(row.outcomes) ? Number(((Number(row.successes) / Number(row.outcomes)) * 100).toFixed(2)) : 0,
      })),
      acceptedCount,
      note: 'Revenue is attributed to recorded successful outcomes only. No causal uplift or incrementality is claimed because there is no control group.',
    };
  }
}

export const outcomeService = new OutcomeService();
