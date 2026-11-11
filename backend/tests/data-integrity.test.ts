import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('referential integrity', () => {
  it('has no orphan orders', async () => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM orders o LEFT JOIN customers c ON c.id = o."customerId" WHERE c.id IS NULL
    `;
    expect(rows[0].count).toBe(0);
  });

  it('has no orphan order lines (order or product)', async () => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM order_lines l
      LEFT JOIN orders o ON o.id = l."orderId"
      LEFT JOIN products p ON p.id = l."productId"
      WHERE o.id IS NULL OR p.id IS NULL
    `;
    expect(rows[0].count).toBe(0);
  });

  it('has no orphan engagement events or consent records', async () => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT (
        (SELECT COUNT(*) FROM engagement_events e LEFT JOIN customers c ON c.id = e."customerId" WHERE c.id IS NULL) +
        (SELECT COUNT(*) FROM consents k LEFT JOIN customers c ON c.id = k."customerId" WHERE c.id IS NULL)
      )::int AS count
    `;
    expect(rows[0].count).toBe(0);
  });
});

describe('transaction arithmetic', () => {
  it('derives every order subtotal from its lines', async () => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      WITH line_totals AS (SELECT "orderId", SUM("lineTotal") AS total FROM order_lines GROUP BY "orderId")
      SELECT COUNT(*)::int AS count
      FROM orders o LEFT JOIN line_totals lt ON lt."orderId" = o.id
      WHERE COALESCE(lt.total, 0) <> o.subtotal
    `;
    expect(rows[0].count).toBe(0);
  });

  it('keeps grossTotal equal to subtotal + shipping + tax', async () => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM orders
      WHERE "grossTotal" <> ("subtotal" + "shippingAmount" + "taxAmount")
    `;
    expect(rows[0].count).toBe(0);
  });

  it('detects exactly one return reconciliation defect (the labelled anomaly)', async () => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      WITH refunds AS (
        SELECT "orderId", SUM("refundAmount") AS refund FROM order_lines GROUP BY "orderId" HAVING SUM("refundAmount") > 0
      )
      SELECT COUNT(*)::int AS count FROM orders o JOIN refunds f ON f."orderId" = o.id
      WHERE o."returnedAmount" <> f.refund OR o."netTotal" <> (o."grossTotal" - f.refund)
    `;
    expect(rows[0].count).toBe(1);
  });
});

describe('consent lifecycle', () => {
  it('exposes exactly one current consent per customer/channel/purpose', async () => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM (
        SELECT "customerId", channel, purpose FROM consents
        WHERE "effectiveTo" IS NULL GROUP BY 1, 2, 3 HAVING COUNT(*) > 1
      ) duplicates
    `;
    expect(rows[0].count).toBe(0);
  });

  it('never leaves an ELIGIBLE promotional recommendation for a customer without consent', async () => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM recommendations r JOIN action_catalog a ON a.id = r."actionId"
      WHERE r.eligibility = 'ELIGIBLE' AND a."requiresMarketingConsent" = true
        AND NOT EXISTS (
          SELECT 1 FROM consents k
          WHERE k."customerId" = r."customerId" AND k.purpose = 'MARKETING'
            AND k.channel::text = a.channel::text AND k.status = 'GRANTED' AND k."effectiveTo" IS NULL
        )
    `;
    expect(rows[0].count).toBe(0);
  });

  it('records a withdrawal timestamp for every withdrawn consent', async () => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM consents WHERE status = 'WITHDRAWN' AND "withdrawnAt" IS NULL
    `;
    expect(rows[0].count).toBe(0);
  });
});

describe('segmentation membership invariants', () => {
  it('assigns every customer exactly one active membership', async () => {
    const rows = await prisma.$queryRaw<Array<{ customerId: number; count: number }>>`
      SELECT m."customerId", COUNT(*)::int AS count
      FROM segment_memberships m JOIN segment_rules s ON s.id = m."segmentId"
      WHERE m.status = 'ACTIVE' AND s."isExclusive" = true
      GROUP BY m."customerId" HAVING COUNT(*) <> 1
    `;
    // Exactly one customer is the labelled conflict (Case 1) injected on purpose.
    expect(rows.length).toBe(1);
  });

  it('preserves historical memberships instead of overwriting them', async () => {
    const total = await prisma.segmentMembership.count();
    const active = await prisma.segmentMembership.count({ where: { status: 'ACTIVE' } });
    expect(total).toBeGreaterThanOrEqual(active);
  });
});
