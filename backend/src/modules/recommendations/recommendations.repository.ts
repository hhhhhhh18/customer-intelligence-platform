import { prisma, Prisma } from '../../db/prisma';

export interface RecommendationFilters {
  search?: string;
  segmentSlug?: string;
  actionSlug?: string;
  eligibility?: string;
  suppression?: string;
  status?: string;
  from?: Date;
  to?: Date;
}

export class RecommendationsRepository {
  async activeMembershipContext() {
    return prisma.segmentMembership.findMany({
      where: { status: 'ACTIVE' },
      select: {
        customerId: true,
        segmentId: true,
        recencyDays: true,
        frequency: true,
        monetary: true,
        serviceCost: true,
        rScore: true,
        fScore: true,
        mScore: true,
        decisionInputs: true,
        segment: { select: { slug: true, segmentCode: true, name: true } },
      },
    });
  }

  async customersByIds(ids: number[]) {
    const rows: Array<{ id: number; customerCode: string; firstName: string; lastName: string; email: string; phone: string | null }> = [];
    const chunk = 5000;
    for (let i = 0; i < ids.length; i += chunk) {
      const part = await prisma.customer.findMany({
        where: { id: { in: ids.slice(i, i + chunk) } },
        select: { id: true, customerCode: true, firstName: true, lastName: true, email: true, phone: true },
      });
      rows.push(...part);
    }
    return rows;
  }

  /** Current (open-ended) marketing consent rows for the given customers. */
  async currentMarketingConsents(customerIds?: number[]) {
    return prisma.consent.findMany({
      where: {
        purpose: 'MARKETING',
        effectiveTo: null,
        ...(customerIds ? { customerId: { in: customerIds } } : {}),
      },
      select: { customerId: true, channel: true, status: true, withdrawnAt: true, effectiveFrom: true },
    });
  }

  async supportStatusByCustomer() {
    return prisma.$queryRaw<Array<{ customerId: number; open_cases: number; escalated_cases: number }>>`
      SELECT "customerId" AS "customerId",
             COUNT(*) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS'))::int AS open_cases,
             COUNT(*) FILTER (WHERE status = 'ESCALATED')::int AS escalated_cases
      FROM support_cases
      GROUP BY "customerId"
    `;
  }

  async lastMarketingContact() {
    return prisma.$queryRaw<Array<{ customerId: number; last_contact: Date }>>`
      SELECT r."customerId" AS "customerId", MAX(r."recommendedAt") AS last_contact
      FROM recommendations r
      JOIN action_catalog a ON a.id = r."actionId"
      WHERE a."isPromotional" = true AND r.eligibility = 'ELIGIBLE'
      GROUP BY r."customerId"
    `;
  }

  async nextRecommendationSequence(): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ max: number | null }>>`
      SELECT COALESCE(MAX(CAST(SUBSTRING("recommendationCode" FROM 10) AS INTEGER)), 0) AS max FROM recommendations
    `;
    return Number(rows[0]?.max ?? 0) + 1;
  }

  async insertMany(rows: Prisma.RecommendationCreateManyInput[]) {
    let created = 0;
    const chunk = 2000;
    for (let i = 0; i < rows.length; i += chunk) {
      const result = await prisma.recommendation.createMany({ data: rows.slice(i, i + chunk), skipDuplicates: true });
      created += result.count;
    }
    return created;
  }

  async idsForRun(runId: string) {
    return prisma.recommendation.findMany({
      where: { runId },
      select: { id: true, customerId: true, recommendationCode: true },
    });
  }

  async insertReasons(rows: Prisma.RecommendationReasonCreateManyInput[]) {
    let created = 0;
    const chunk = 5000;
    for (let i = 0; i < rows.length; i += chunk) {
      const result = await prisma.recommendationReason.createMany({ data: rows.slice(i, i + chunk) });
      created += result.count;
    }
    return created;
  }

  async actions() {
    return prisma.actionCatalog.findMany({ orderBy: { priority: 'asc' } });
  }

  async segments() {
    return prisma.segmentRule.findMany({ orderBy: { priority: 'asc' }, select: { id: true, slug: true, name: true } });
  }

  private buildWhere(filters: RecommendationFilters): Prisma.RecommendationWhereInput {
    const where: Prisma.RecommendationWhereInput = {};
    if (filters.segmentSlug) where.segment = { slug: filters.segmentSlug };
    if (filters.actionSlug) where.action = { slug: filters.actionSlug };
    if (filters.eligibility) where.eligibility = filters.eligibility as Prisma.EnumRecommendationEligibilityFilter;
    if (filters.suppression) where.suppressionResult = filters.suppression as Prisma.EnumSuppressionResultFilter;
    if (filters.status) where.status = filters.status as Prisma.EnumRecommendationStatusFilter;
    if (filters.from || filters.to) {
      where.recommendedAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    if (filters.search) {
      const term = filters.search.trim();
      where.customer = {
        OR: [
          { customerCode: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      };
    }
    return where;
  }

  async findMany(filters: RecommendationFilters, skip: number, take: number) {
    const where = this.buildWhere(filters);
    const [total, rows] = await Promise.all([
      prisma.recommendation.count({ where }),
      prisma.recommendation.findMany({
        where,
        skip,
        take,
        orderBy: [{ recommendedAt: 'desc' }, { id: 'desc' }],
        include: {
          customer: { select: { id: true, customerCode: true, firstName: true, lastName: true, email: true } },
          action: { select: { name: true, slug: true, isPromotional: true, actionType: true, channel: true } },
          segment: { select: { name: true, slug: true } },
        },
      }),
    ]);
    return { total, rows };
  }

  async findById(id: number) {
    return prisma.recommendation.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, customerCode: true, firstName: true, lastName: true, email: true, phone: true },
        },
        action: true,
        segment: true,
        reasons: { orderBy: { weight: 'desc' } },
        outcomes: {
          include: { action: { select: { name: true, slug: true } }, order: { select: { orderCode: true } } },
        },
      },
    });
  }

  async summaryCounts(runId?: string) {
    const where = runId ? { runId } : {};
    const grouped = await prisma.recommendation.groupBy({
      by: ['eligibility'],
      where,
      _count: { _all: true },
    });
    return grouped;
  }

  async markSuppressed(id: number, reason: Prisma.InputJsonValue) {
    return prisma.recommendation.update({
      where: { id },
      data: { eligibility: 'SUPPRESSED', suppressionResult: 'SUPPRESSED_CONSENT', status: 'SUPPRESSED' },
    });
  }
}

export class RecommendationRunRepository {
  async start(runCodeValue: string, asOf: Date) {
    return prisma.recommendationRun.create({
      data: { runCode: runCodeValue, ruleVersion: 'nba-v1.0.0', asOfDate: asOf, status: 'RUNNING', processed: 0, eligibleCount: 0, suppressedCount: 0, noActionCount: 0 },
    });
  }

  async complete(id: number, data: { processed: number; eligibleCount: number; suppressedCount: number; noActionCount: number }) {
    return prisma.recommendationRun.update({
      where: { id },
      data: { ...data, status: 'COMPLETED', completedAt: new Date() },
    });
  }

  async fail(id: number) {
    return prisma.recommendationRun.update({ where: { id }, data: { status: 'FAILED', completedAt: new Date() } });
  }

  async latest() {
    return prisma.recommendationRun.findFirst({ orderBy: { startedAt: 'desc' } });
  }

  async recent(limit = 10) {
    return prisma.recommendationRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
  }
}

