import { prisma, Prisma } from '../../db/prisma';
import { RfmInput, NO_PURCHASE_RECENCY } from './rfm';

export interface MetricsRow {
  id: number;
  customerCode: string;
  signupDate: Date;
  frequency: number;
  monetary: string | number;
  service_cost: string | number;
  open_cases: number;
  last_order: Date | null;
}

const METRICS_SQL = Prisma.sql`
  WITH line_totals AS (
    SELECT "orderId", SUM("netLineTotal") AS net
    FROM order_lines
    GROUP BY "orderId"
  ),
  order_totals AS (
    SELECT o."customerId" AS customer_id,
           COUNT(*) AS freq,
           MAX(o."orderDate") AS last_order,
           SUM(o."shippingAmount" + o."taxAmount" + COALESCE(lt.net, 0)) AS monetary
    FROM orders o
    LEFT JOIN line_totals lt ON lt."orderId" = o.id
    WHERE o.status IN ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED')
    GROUP BY o."customerId"
  ),
  case_totals AS (
    SELECT "customerId" AS customer_id,
           SUM("handlingCost") AS service_cost,
           COUNT(*) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS', 'ESCALATED')) AS open_cases
    FROM support_cases
    GROUP BY "customerId"
  )
  SELECT c.id,
         c."customerCode" AS "customerCode",
         c."signupDate" AS "signupDate",
         COALESCE(ot.freq, 0)::int AS frequency,
         COALESCE(ot.monetary, 0) AS monetary,
         COALESCE(ct.service_cost, 0) AS service_cost,
         COALESCE(ct.open_cases, 0)::int AS open_cases,
         ot.last_order AS last_order
  FROM customers c
  LEFT JOIN order_totals ot ON ot.customer_id = c.id
  LEFT JOIN case_totals ct ON ct.customer_id = c.id
`;

export class SegmentationRepository {
  async loadMetrics(): Promise<MetricsRow[]> {
    return prisma.$queryRaw<MetricsRow[]>(METRICS_SQL);
  }

  async getLatestReferenceDate(): Promise<Date | null> {
    const run = await prisma.generationRun.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { startedAt: 'desc' },
      select: { referenceDate: true },
    });
    return run?.referenceDate ?? null;
  }

  async countCustomers(): Promise<number> {
    return prisma.customer.count();
  }

  async listSegments() {
    return prisma.segmentRule.findMany({ orderBy: { priority: 'asc' } });
  }

  async activeMemberships(customerIds?: number[]) {
    return prisma.segmentMembership.findMany({
      where: {
        status: 'ACTIVE',
        ...(customerIds ? { customerId: { in: customerIds } } : {}),
      },
      select: {
        id: true,
        customerId: true,
        segmentId: true,
        membershipCode: true,
        effectiveFrom: true,
      },
    });
  }

  async closeMemberships(ids: number[], asOf: Date, status: 'SUPERSEDED' | 'EXPIRED' = 'SUPERSEDED') {
    if (!ids.length) return 0;
    const result = await prisma.segmentMembership.updateMany({
      where: { id: { in: ids } },
      data: { status, effectiveTo: asOf },
    });
    return result.count;
  }

  async createMemberships(data: Prisma.SegmentMembershipCreateManyInput[]) {
    let created = 0;
    const chunk = 2000;
    for (let i = 0; i < data.length; i += chunk) {
      const result = await prisma.segmentMembership.createMany({ data: data.slice(i, i + chunk) });
      created += result.count;
    }
    return created;
  }

  async segmentBySlug() {
    const rows = await this.listSegments();
    return new Map(rows.map((r) => [r.slug, r]));
  }

  async segmentCounts() {
    return prisma.segmentMembership.groupBy({
      by: ['segmentId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    });
  }

  async countUnassigned() {
    return prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM customers c
      WHERE NOT EXISTS (
        SELECT 1 FROM segment_memberships m
        WHERE m."customerId" = c.id AND m.status = 'ACTIVE'
      )
    `;
  }
}

export class SegmentationRunRepository {
  async start(runCode: string, ruleVersion: string, asOfDate: Date) {
    return prisma.segmentationRun.create({
      data: { runCode, ruleVersion, asOfDate, status: 'RUNNING', customersScored: 0, membershipsCreated: 0, conflictsDetected: 0, unassignedCount: 0 },
    });
  }

  async complete(
    id: number,
    data: { customersScored: number; membershipsCreated: number; conflictsDetected: number; unassignedCount: number },
  ) {
    return prisma.segmentationRun.update({
      where: { id },
      data: { ...data, status: 'COMPLETED', completedAt: new Date() },
    });
  }

  async fail(id: number) {
    return prisma.segmentationRun.update({ where: { id }, data: { status: 'FAILED', completedAt: new Date() } });
  }

  async latest() {
    return prisma.segmentationRun.findFirst({ orderBy: { startedAt: 'desc' } });
  }

  async recent(limit = 10) {
    return prisma.segmentationRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
  }
}

export function toRfmInput(row: MetricsRow, asOf: Date): RfmInput {
  const asOfMidnight = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const lastOrder = row.last_order ? new Date(row.last_order) : null;
  const recencyDays = lastOrder
    ? Math.max(
        0,
        Math.round(
          (asOfMidnight - Date.UTC(lastOrder.getUTCFullYear(), lastOrder.getUTCMonth(), lastOrder.getUTCDate())) /
            86_400_000,
        ),
      )
    : NO_PURCHASE_RECENCY;

  const signup = new Date(row.signupDate);
  const tenureDays = Math.max(
    0,
    Math.round(
      (asOfMidnight - Date.UTC(signup.getUTCFullYear(), signup.getUTCMonth(), signup.getUTCDate())) / 86_400_000,
    ),
  );

  return {
    customerId: row.id,
    customerCode: row.customerCode,
    tenureDays,
    recencyDays,
    frequency: Number(row.frequency),
    monetaryPaise: Math.round(Number(row.monetary) * 100),
    serviceCostPaise: Math.round(Number(row.service_cost) * 100),
    openCases: Number(row.open_cases),
  };
}

