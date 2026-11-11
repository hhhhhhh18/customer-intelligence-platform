/**
 * The four mandatory negative scenarios must be present in the database and
 * must be detected with preserved evidence.  These tests assert the *behaviour*
 * of the detectors, not the injection manifest, so a silent regression breaks
 * the build.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('CASE 1 - conflicting exclusive segments', () => {
  it('records an exception with expected and actual membership counts', async () => {
    const exception = await prisma.exceptionRecord.findFirst({
      where: { category: 'SEGMENT_CONFLICT' },
      include: { customer: true },
    });
    expect(exception).toBeTruthy();
    expect(exception?.expectedValue).toBe('1 active exclusive segment');
    expect(exception?.actualValue).toContain('2 active exclusive segments');
    expect(exception?.detectionRuleId).toBe('SEG-EXCL-01');
  });

  it('keeps both memberships and flags them instead of deleting the duplicate', async () => {
    const exception = await prisma.exceptionRecord.findFirst({ where: { category: 'SEGMENT_CONFLICT' } });
    const memberships = await prisma.segmentMembership.findMany({
      where: { customerId: exception!.customerId!, status: 'ACTIVE' },
    });
    expect(memberships.length).toBeGreaterThanOrEqual(2);
    expect(memberships.every((m) => m.isExclusiveConflict)).toBe(true);
    expect(memberships.some((m) => m.ruleVersion === 'legacy-import-v0')).toBe(true);
  });

  it('stores the conflicting segments as evidence', async () => {
    const exception = await prisma.exceptionRecord.findFirst({ where: { category: 'SEGMENT_CONFLICT' } });
    const evidence = exception?.evidence as { segments: Array<{ segment: string }> };
    expect(evidence.segments.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CASE 2 - consent violation', () => {
  it('blocks the promotional recommendation and marks it suppressed', async () => {
    const exception = await prisma.exceptionRecord.findFirst({
      where: { category: 'CONSENT_VIOLATION' },
      include: { recommendation: true },
    });
    expect(exception).toBeTruthy();
    expect(exception?.recommendation).toBeTruthy();
    expect(exception?.recommendation?.eligibility).toBe('SUPPRESSED');
    expect(exception?.recommendation?.suppressionResult).toBe('SUPPRESSED_CONSENT');
    expect(exception?.recommendation?.status).toBe('SUPPRESSED');
  });

  it('preserves the original eligibility in the audit trail', async () => {
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'CONSENT_VIOLATION_BLOCKED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
    const payload = audit?.payload as Record<string, unknown>;
    expect(payload.previousEligibility).toBe('ELIGIBLE');
    expect(payload.newEligibility).toBe('SUPPRESSED');
  });

  it('adds a consent enforcement reason so the explanation stays traceable', async () => {
    const exception = await prisma.exceptionRecord.findFirst({ where: { category: 'CONSENT_VIOLATION' } });
    const reason = await prisma.recommendationReason.findFirst({
      where: { recommendationId: exception!.recommendationId!, reasonCode: 'CONSENT_ENFORCEMENT' },
    });
    expect(reason).toBeTruthy();
    expect(reason?.detail).toMatch(/consent/i);
  });

  it('exports expected net spend independently of the header anomaly', async () => {
    const exception = await prisma.exceptionRecord.findFirst({ where: { category: 'RETURN_NOT_NETTED' } });
    expect(exception?.expectedValue).toContain('returned');
    expect(exception?.actualValue).toContain('returned 0.00');
  });
});

describe('CASE 3 - returns not netted', () => {
  it('detects the discrepancy and stores expected vs actual values', async () => {
    const exception = await prisma.exceptionRecord.findFirst({
      where: { category: 'RETURN_NOT_NETTED' },
      include: { customer: true },
    });
    expect(exception).toBeTruthy();
    const evidence = exception?.evidence as Record<string, number>;
    expect(evidence.refundSum).toBeGreaterThan(0);
    expect(evidence.expectedNetTotal).toBeLessThan(evidence.actualNetTotal);
    expect(evidence.discrepancy).toBeGreaterThan(0);
  });

  it('uses the corrected monetary value in segmentation for the affected customer', async () => {
    const exception = await prisma.exceptionRecord.findFirst({ where: { category: 'RETURN_NOT_NETTED' } });
    const evidence = exception?.evidence as Record<string, number>;
    const membership = await prisma.segmentMembership.findFirst({
      where: { customerId: exception!.customerId!, status: 'ACTIVE' },
    });

    const expectedMonetary = await prisma.$queryRaw<Array<{ monetary: string }>>`
      WITH refunds AS (SELECT "orderId", SUM("refundAmount") AS refund FROM order_lines GROUP BY "orderId")
      SELECT COALESCE(SUM(o."shippingAmount" + o."taxAmount" + (lt.total - COALESCE(rf.refund, 0))), 0)::text AS monetary
      FROM orders o
      JOIN (SELECT "orderId", SUM("lineTotal") AS total FROM order_lines GROUP BY "orderId") lt ON lt."orderId" = o.id
      LEFT JOIN refunds rf ON rf."orderId" = o.id
      WHERE o."customerId" = ${exception!.customerId} AND o.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')
    `;

    expect(Number(membership?.monetary ?? 0)).toBeCloseTo(Number(expectedMonetary[0]?.monetary ?? 0), 2);

    // The corrected figure must equal the stored header figures minus exactly
    // the un-netted refund on the defective order - i.e. segmentation used the
    // line-level truth, not the inflated header.
    const headerMonetary = await prisma.$queryRaw<Array<{ monetary: string }>>`
      SELECT COALESCE(SUM(o."netTotal"), 0)::text AS monetary
      FROM orders o
      WHERE o."customerId" = ${exception!.customerId} AND o.status <> 'CANCELLED'
    `;
    const corrected = Number(membership?.monetary ?? 0);
    const header = Number(headerMonetary[0]?.monetary ?? 0);
    expect(header).toBeGreaterThan(corrected);
    expect(header - corrected).toBeCloseTo(evidence.discrepancy, 2);
  });
});

describe('CASE 4 - outcome attribution', () => {
  it('detects the action mismatch and records expected vs actual', async () => {
    const exception = await prisma.exceptionRecord.findFirst({ where: { category: 'OUTCOME_ATTRIBUTION' } });
    expect(exception).toBeTruthy();
    expect(exception?.expectedValue).toBeTruthy();
    expect(exception?.actualValue).toBeTruthy();
    expect(exception?.expectedValue).not.toBe(exception?.actualValue);
  });

  it('preserves the original defective outcome row instead of rewriting it', async () => {
    const exception = await prisma.exceptionRecord.findFirst({ where: { category: 'OUTCOME_ATTRIBUTION' } });
    const outcome = await prisma.actionOutcome.findUnique({
      where: { outcomeCode: exception!.entityId },
      include: { recommendation: true },
    });
    expect(outcome).toBeTruthy();
    expect(outcome!.actionId).not.toBe(outcome!.recommendation.actionId);
    expect(outcome!.isAttributionValid).toBe(false);
  });

  it('logs an audit event when the mismatch is flagged', async () => {
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'OUTCOME_ATTRIBUTION_FLAGGED' } });
    expect(audit).toBeTruthy();
  });
});

describe('ground truth isolation', () => {
  it('never imports ground-truth labels into the OLTP schema', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const names = tables.map((t) => t.table_name);
    expect(names.some((name) => name.includes('ground'))).toBe(false);
    expect(names.some((name) => name.includes('archetype'))).toBe(false);
  });
});
