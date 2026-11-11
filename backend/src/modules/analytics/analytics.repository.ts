import { prisma, Prisma } from '../../db/prisma';

/**
 * Dashboard queries.  Every figure is an aggregate over persisted rows; no
 * metric is hardcoded.  Revenue is reconciled from line-level refunds so the
 * injected "returns not netted" defect cannot inflate headline revenue.
 */
export class AnalyticsRepository {
  async summary() {
    const rows = await prisma.$queryRaw<
      Array<{
        total_customers: number;
        total_orders: number;
        total_net_revenue: string;
        active_customers: number;
        dormant_customers: number;
        at_risk: number;
        eligible_recs: number;
        suppressed_recs: number;
        total_recs: number;
        open_exceptions: number;
        engagement_events: number;
        support_cases: number;
      }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM customers) AS total_customers,
        (SELECT COUNT(*)::int FROM orders) AS total_orders,
        (SELECT COALESCE(SUM(o."grossTotal" - COALESCE(rf.refund, 0)), 0)
           FROM orders o
           LEFT JOIN (SELECT "orderId", SUM("refundAmount") AS refund FROM order_lines GROUP BY "orderId") rf
             ON rf."orderId" = o.id
          WHERE o.status <> 'CANCELLED') AS total_net_revenue,
        (SELECT COUNT(*)::int FROM customers WHERE lifecycle = 'ACTIVE') AS active_customers,
        (SELECT COUNT(*)::int FROM customers WHERE lifecycle IN ('DORMANT', 'CHURNED')) AS dormant_customers,
        (SELECT COUNT(DISTINCT m."customerId")::int
           FROM segment_memberships m JOIN segment_rules s ON s.id = m."segmentId"
          WHERE m.status = 'ACTIVE' AND s.slug IN ('at-risk-customers', 'cannot-lose-them', 'hibernating-customers')) AS at_risk,
        (SELECT COUNT(*)::int FROM recommendations WHERE eligibility = 'ELIGIBLE') AS eligible_recs,
        (SELECT COUNT(*)::int FROM recommendations WHERE eligibility = 'SUPPRESSED') AS suppressed_recs,
        (SELECT COUNT(*)::int FROM recommendations) AS total_recs,
        (SELECT COUNT(*)::int FROM exception_records WHERE status = 'OPEN') AS open_exceptions,
        (SELECT COUNT(*)::int FROM engagement_events) AS engagement_events,
        (SELECT COUNT(*)::int FROM support_cases) AS support_cases
    `;
    return rows[0];
  }

  async segmentDistribution() {
    return prisma.$queryRaw<Array<{ slug: string; name: string; count: number; share: number }>>`
      SELECT s.slug, s.name, COUNT(m.id)::int AS count,
             ROUND((COUNT(m.id)::numeric / NULLIF((SELECT COUNT(*) FROM customers), 0)) * 100, 2)::float8 AS share
      FROM segment_rules s
      LEFT JOIN segment_memberships m ON m."segmentId" = s.id AND m.status = 'ACTIVE'
      GROUP BY s.slug, s.name, s."priority"
      ORDER BY s."priority"
    `;
  }

  async purchaseTrend(months = 12) {
    return prisma.$queryRaw<Array<{ month: string; orders: number; revenue: number; customers: number }>>`
      WITH months AS (
        SELECT date_trunc('month', g."referenceDate") - (n || ' month')::interval AS month_start
        FROM generate_series(0, ${months - 1}) AS n
        CROSS JOIN (SELECT "referenceDate" FROM generation_runs ORDER BY "startedAt" DESC LIMIT 1) g
      )
      SELECT to_char(m.month_start, 'YYYY-MM') AS month,
             COALESCE(COUNT(o.id), 0)::int AS orders,
             COALESCE(SUM(o."grossTotal" - COALESCE(rf.refund, 0)), 0)::float8 AS revenue,
             COALESCE(COUNT(DISTINCT o."customerId"), 0)::int AS customers
      FROM months m
      LEFT JOIN orders o ON date_trunc('month', o."orderDate") = m.month_start AND o.status <> 'CANCELLED'
      LEFT JOIN (SELECT "orderId", SUM("refundAmount") AS refund FROM order_lines GROUP BY "orderId") rf
        ON rf."orderId" = o.id
      GROUP BY m.month_start
      ORDER BY m.month_start ASC
    `;
  }

  async rfmDistribution() {
    return prisma.$queryRaw<Array<{ score: number; band: string; count: number }>>`
      SELECT score, band, COUNT(*)::int AS count FROM (
        SELECT m."rScore" AS score, 'R' AS band FROM segment_memberships m WHERE m.status = 'ACTIVE'
        UNION ALL
        SELECT m."fScore" AS score, 'F' AS band FROM segment_memberships m WHERE m.status = 'ACTIVE'
        UNION ALL
        SELECT m."mScore" AS score, 'M' AS band FROM segment_memberships m WHERE m.status = 'ACTIVE'
      ) scores
      GROUP BY score, band
      ORDER BY band, score
    `;
  }

  async recommendationDistribution() {
    return prisma.$queryRaw<Array<{ action: string; slug: string; eligible: number; suppressed: number; noAction: number }>>`
      SELECT a.name AS action, a.slug,
             COUNT(*) FILTER (WHERE r.eligibility = 'ELIGIBLE')::int AS eligible,
             COUNT(*) FILTER (WHERE r.eligibility = 'SUPPRESSED')::int AS suppressed,
             COUNT(*) FILTER (WHERE r.eligibility = 'NO_ACTION')::int AS "noAction"
      FROM recommendations r
      JOIN action_catalog a ON a.id = r."actionId"
      GROUP BY a.name, a.slug, a.priority
      ORDER BY a.priority
    `;
  }

  async outcomePerformance() {
    return prisma.$queryRaw<
      Array<{ action: string; slug: string; success: number; failure: number; noResponse: number; revenue: number }>
    >`
      SELECT a.name AS action, a.slug,
             COUNT(*) FILTER (WHERE o.status = 'SUCCESS')::int AS success,
             COUNT(*) FILTER (WHERE o.status = 'FAILURE')::int AS failure,
             COUNT(*) FILTER (WHERE o.status = 'NO_RESPONSE')::int AS "noResponse",
             COALESCE(SUM(o."revenueAttributed") FILTER (WHERE o.status = 'SUCCESS'), 0)::float8 AS revenue
      FROM action_outcomes o
      JOIN action_catalog a ON a.id = o."actionId"
      GROUP BY a.name, a.slug, a.priority
      ORDER BY a.priority
    `;
  }

  async dataQualityScore() {
    const run = await prisma.dataQualityRun.findFirst({ orderBy: { startedAt: 'desc' } });
    return run ? Number(run.score) : null;
  }

  async exceptionBreakdown() {
    return prisma.exceptionRecord.groupBy({ by: ['category'], _count: { _all: true }, where: { status: 'OPEN' } });
  }

  async recentExceptions(limit = 5) {
    return prisma.exceptionRecord.findMany({
      orderBy: { detectedAt: 'desc' },
      take: limit,
      include: { customer: { select: { customerCode: true } } },
    });
  }

  async topSegmentsByRevenue(limit = 5) {
    return prisma.$queryRaw<Array<{ name: string; slug: string; revenue: number; customers: number }>>`
      SELECT s.name, s.slug,
             COALESCE(SUM(o."grossTotal" - COALESCE(rf.refund, 0)), 0)::float8 AS revenue,
             COUNT(DISTINCT m."customerId")::int AS customers
      FROM segment_rules s
      JOIN segment_memberships m ON m."segmentId" = s.id AND m.status = 'ACTIVE'
      LEFT JOIN orders o ON o."customerId" = m."customerId" AND o.status <> 'CANCELLED'
      LEFT JOIN (SELECT "orderId", SUM("refundAmount") AS refund FROM order_lines GROUP BY "orderId") rf
        ON rf."orderId" = o.id
      GROUP BY s.name, s.slug
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;
  }

  async engagementTrend(months = 6) {
    return prisma.$queryRaw<Array<{ month: string; events: number }>>`
      SELECT to_char(date_trunc('month', "occurredAt"), 'YYYY-MM') AS month, COUNT(*)::int AS events
      FROM engagement_events
      WHERE "occurredAt" >= (SELECT "referenceDate" FROM generation_runs ORDER BY "startedAt" DESC LIMIT 1) - (${months} || ' month')::interval
      GROUP BY 1
      ORDER BY 1
    `;
  }

  async supportSummary() {
    return prisma.$queryRaw<Array<{ status: string; count: number }>>`
      SELECT status::text AS status, COUNT(*)::int AS count FROM support_cases GROUP BY status ORDER BY count DESC
    `;
  }

  async volumeStats() {
    const [customers, orders, events] = await Promise.all([
      prisma.customer.count(),
      prisma.order.count(),
      prisma.engagementEvent.count(),
    ]);
    return { customers, orders, events };
  }

  async latestGenerationRun() {
    return prisma.generationRun.findFirst({ orderBy: { startedAt: 'desc' } });
  }
}
