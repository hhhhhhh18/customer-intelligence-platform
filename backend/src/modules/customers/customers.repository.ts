import { prisma, Prisma } from '../../db/prisma';

export interface CustomerFilters {
  search?: string;
  segmentSlug?: string;
  consentStatus?: 'GRANTED' | 'WITHDRAWN' | 'NONE';
  lifecycle?: string;
  minRfm?: number;
  maxRfm?: number;
  hasOpenCase?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

const SORTABLE: Record<string, Prisma.Sql> = {
  customerCode: Prisma.sql`c."customerCode"`,
  name: Prisma.sql`c."lastName"`,
  signupDate: Prisma.sql`c."signupDate"`,
  totalOrders: Prisma.sql`COALESCE(agg.orders, 0)`,
  netSpend: Prisma.sql`COALESCE(agg.net_spend, 0)`,
  lastPurchase: Prisma.sql`agg.last_purchase`,
  rfmScore: Prisma.sql`COALESCE(m."rfmScore", 0)`,
};

export class CustomersRepository {
  private buildFilters(filters: CustomerFilters): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      const digits = filters.search.replace(/\D/g, '');
      const byId = digits
        ? Prisma.sql`OR c."customerCode" ILIKE ${`%${digits.padStart(6, '0')}%`}`
        : Prisma.empty;
      conditions.push(
        Prisma.sql`(c."firstName" ILIKE ${term} OR c."lastName" ILIKE ${term} OR c.email ILIKE ${term} OR c."customerCode" ILIKE ${term} ${byId})`,
      );
    }
    if (filters.segmentSlug) conditions.push(Prisma.sql`s.slug = ${filters.segmentSlug}`);
    if (filters.lifecycle) conditions.push(Prisma.sql`c.lifecycle::text = ${filters.lifecycle}`);
    if (filters.consentStatus === 'NONE') {
      conditions.push(Prisma.sql`cur.status IS NULL`);
    } else if (filters.consentStatus) {
      conditions.push(Prisma.sql`cur.status::text = ${filters.consentStatus}`);
    }
    if (filters.minRfm !== undefined) conditions.push(Prisma.sql`m."rfmScore" >= ${filters.minRfm}`);
    if (filters.maxRfm !== undefined) conditions.push(Prisma.sql`m."rfmScore" <= ${filters.maxRfm}`);
    if (filters.hasOpenCase) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM support_cases sc WHERE sc."customerId" = c.id AND sc.status IN ('OPEN','IN_PROGRESS','ESCALATED')
      )`);
    }
    return Prisma.join(conditions, ' AND ');
  }

  private baseCtes() {
    return Prisma.sql`
      WITH refunds AS (
        SELECT "orderId", SUM("refundAmount") AS refund FROM order_lines GROUP BY "orderId"
      ),
      agg AS (
        SELECT o."customerId" AS cid,
               COUNT(*)::int AS orders,
               SUM(o."grossTotal" - COALESCE(rf.refund, 0)) AS net_spend,
               MAX(o."orderDate") AS last_purchase
        FROM orders o
        LEFT JOIN refunds rf ON rf."orderId" = o.id
        WHERE o.status <> 'CANCELLED'
        GROUP BY o."customerId"
      ),
      cur AS (
        SELECT DISTINCT ON (k."customerId") k."customerId" AS cid, k.status
        FROM consents k
        WHERE k.purpose = 'MARKETING' AND k.channel = 'EMAIL' AND k."effectiveTo" IS NULL
        ORDER BY k."customerId", k."effectiveFrom" DESC
      )
    `;
  }

  async findMany(filters: CustomerFilters, skip: number, take: number) {
    const where = this.buildFilters(filters);
    const orderColumn = SORTABLE[filters.sortBy ?? 'customerCode'] ?? SORTABLE.customerCode;
    const direction = Prisma.raw(filters.sortDir === 'asc' ? 'ASC' : 'DESC');

    const rows = await prisma.$queryRaw<
      Array<{
        id: number;
        customerCode: string;
        firstName: string;
        lastName: string;
        email: string;
        signupDate: Date;
        lifecycle: string;
        totalOrders: number;
        netSpend: string;
        lastPurchase: Date | null;
        rfmScore: number | null;
        rScore: number | null;
        fScore: number | null;
        mScore: number | null;
        segmentSlug: string | null;
        segmentName: string | null;
        consentStatus: string;
      }>
    >(Prisma.sql`
      ${this.baseCtes()}
      SELECT c.id, c."customerCode", c."firstName", c."lastName", c.email, c."signupDate",
             c.lifecycle::text AS lifecycle,
             COALESCE(agg.orders, 0) AS "totalOrders",
             COALESCE(agg.net_spend, 0)::text AS "netSpend",
             agg.last_purchase AS "lastPurchase",
             m."rfmScore", m."rScore", m."fScore", m."mScore",
             s.slug AS "segmentSlug", s.name AS "segmentName",
             COALESCE(cur.status::text, 'NONE') AS "consentStatus"
      FROM customers c
      LEFT JOIN agg ON agg.cid = c.id
      LEFT JOIN LATERAL (
        SELECT mm.* FROM segment_memberships mm
        WHERE mm."customerId" = c.id AND mm.status = 'ACTIVE'
        ORDER BY mm.id ASC LIMIT 1
      ) m ON TRUE
      LEFT JOIN segment_rules s ON s.id = m."segmentId"
      LEFT JOIN cur ON cur.cid = c.id
      WHERE ${where}
      ORDER BY ${orderColumn} ${direction}, c.id ASC
      LIMIT ${take} OFFSET ${skip}
    `);

    const countRows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      ${this.baseCtes()}
      SELECT COUNT(*)::int AS count
      FROM customers c
      LEFT JOIN agg ON agg.cid = c.id
      LEFT JOIN LATERAL (
        SELECT mm.* FROM segment_memberships mm
        WHERE mm."customerId" = c.id AND mm.status = 'ACTIVE'
        ORDER BY mm.id ASC LIMIT 1
      ) m ON TRUE
      LEFT JOIN segment_rules s ON s.id = m."segmentId"
      LEFT JOIN cur ON cur.cid = c.id
      WHERE ${where}
    `);

    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async findByIdOrCode(idOrCode: string) {
    const numeric = Number(idOrCode);
    const customer = await prisma.customer.findFirst({
      where: Number.isFinite(numeric) && String(numeric) === idOrCode ? { id: numeric } : { customerCode: idOrCode },
    });
    return customer;
  }

  async ordersFor(customerId: number, take = 20) {
    return prisma.order.findMany({
      where: { customerId },
      orderBy: { orderDate: 'desc' },
      take,
      include: { orderLines: { include: { product: { select: { name: true, productCode: true } } } } },
    });
  }

  async eventsFor(customerId: number, take = 25) {
    return prisma.engagementEvent.findMany({ where: { customerId }, orderBy: { occurredAt: 'desc' }, take });
  }

  async casesFor(customerId: number) {
    return prisma.supportCase.findMany({ where: { customerId }, orderBy: { openedAt: 'desc' } });
  }

  async consentsFor(customerId: number) {
    return prisma.consent.findMany({ where: { customerId }, orderBy: [{ channel: 'asc' }, { effectiveFrom: 'desc' }] });
  }

  async membershipsFor(customerId: number) {
    return prisma.segmentMembership.findMany({
      where: { customerId },
      include: { segment: { select: { name: true, slug: true, segmentCode: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async recommendationsFor(customerId: number, take = 10) {
    return prisma.recommendation.findMany({
      where: { customerId },
      orderBy: { recommendedAt: 'desc' },
      take,
      include: {
        action: { select: { name: true, slug: true, isPromotional: true, channel: true } },
        segment: { select: { name: true, slug: true } },
        reasons: { orderBy: { weight: 'desc' }, take: 3 },
        outcomes: { select: { outcomeCode: true, status: true, revenueAttributed: true } },
      },
    });
  }

  async aggregateMetrics(customerId: number) {
    const rows = await prisma.$queryRaw<
      Array<{ orders: number; net_spend: string; last_purchase: Date | null; refunds: string; return_count: number }>
    >`
      WITH refunds AS (
        SELECT "orderId", SUM("refundAmount") AS refund FROM order_lines GROUP BY "orderId"
      )
      SELECT COUNT(*)::int AS orders,
             COALESCE(SUM(o."grossTotal" - COALESCE(rf.refund, 0)), 0)::text AS net_spend,
             MAX(o."orderDate") AS last_purchase,
             COALESCE(SUM(COALESCE(rf.refund, 0)), 0)::text AS refunds,
             COUNT(*) FILTER (WHERE COALESCE(rf.refund, 0) > 0)::int AS return_count
      FROM orders o
      LEFT JOIN refunds rf ON rf."orderId" = o.id
      WHERE o."customerId" = ${customerId} AND o.status <> 'CANCELLED'
    `;
    return rows[0];
  }

  async exceptionsFor(customerId: number) {
    return prisma.exceptionRecord.findMany({
      where: { customerId },
      orderBy: { detectedAt: 'desc' },
      take: 10,
    });
  }

  async segmentHistoryCounts() {
    return prisma.segmentMembership.groupBy({ by: ['status'], _count: { _all: true } });
  }
}
