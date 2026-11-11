/**
 * Anomaly detectors.
 *
 * Each detector is idempotent (an exception is unique per category + entity +
 * rule) and each one preserves evidence instead of repairing data silently.
 * Detection never reads ground-truth files: it has to work on unfiltered
 * production data.
 */
import { prisma, Prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { auditService } from '../audit/audit.service';
import { ExceptionsRepository } from './exceptions.repository';

export interface DetectionSummary {
  category: string;
  detected: number;
  blocked: number;
  durationMs: number;
}

export interface DetectionRunResult {
  startedAt: string;
  finishedAt: string;
  detectors: DetectionSummary[];
  totalOpen: number;
}

export class DetectorService {
  constructor(private readonly repo = new ExceptionsRepository()) {}

  private async createException(input: {
    category: Prisma.ExceptionRecordCreateInput['category'];
    severity: Prisma.ExceptionRecordCreateInput['severity'];
    entityType: string;
    entityId: string;
    customerId?: number | null;
    recommendationId?: number | null;
    expectedValue?: string | null;
    actualValue?: string | null;
    explanation: string;
    detectionRuleId: string;
    evidence: Prisma.InputJsonValue;
  }) {
    const code = await this.repo.nextCode();
    return prisma.exceptionRecord.upsert({
      where: {
        category_entityType_entityId_detectionRuleId: {
          category: input.category,
          entityType: input.entityType,
          entityId: input.entityId,
          detectionRuleId: input.detectionRuleId,
        },
      },
      create: {
        exceptionCode: code,
        category: input.category,
        severity: input.severity,
        entityType: input.entityType,
        entityId: input.entityId,
        customerId: input.customerId ?? null,
        recommendationId: input.recommendationId ?? null,
        expectedValue: input.expectedValue ?? null,
        actualValue: input.actualValue ?? null,
        explanation: input.explanation,
        detectionRuleId: input.detectionRuleId,
        evidence: input.evidence,
      },
      update: {},
    });
  }

  /** CASE 1 - a customer holding two active exclusive segments. */
  async detectSegmentConflicts(): Promise<DetectionSummary> {
    const startedAt = Date.now();
    const conflicts = await prisma.$queryRaw<
      Array<{ customerId: number; customerCode: string; segmentCount: number }>
    >`
      SELECT m."customerId" AS "customerId", c."customerCode" AS "customerCode", COUNT(*)::int AS "segmentCount"
      FROM segment_memberships m
      JOIN segment_rules s ON s.id = m."segmentId"
      JOIN customers c ON c.id = m."customerId"
      WHERE m.status = 'ACTIVE' AND s."isExclusive" = true
      GROUP BY m."customerId", c."customerCode"
      HAVING COUNT(*) > 1
    `;

    let detected = 0;
    for (const conflict of conflicts) {
      const memberships = await prisma.segmentMembership.findMany({
        where: { customerId: conflict.customerId, status: 'ACTIVE', segment: { isExclusive: true } },
        include: { segment: { select: { slug: true, name: true, segmentCode: true, isExclusive: true } } },
        orderBy: { id: 'asc' },
      });

      const segments = memberships.map((m) => ({
        membershipCode: m.membershipCode,
        segment: m.segment.slug,
        segmentName: m.segment.name,
        ruleVersion: m.ruleVersion,
        assignedAt: m.assignedAt.toISOString(),
      }));

      await this.createException({
        category: 'SEGMENT_CONFLICT',
        severity: 'HIGH',
        entityType: 'Customer',
        entityId: conflict.customerCode,
        customerId: conflict.customerId,
        expectedValue: '1 active exclusive segment',
        actualValue: `${conflict.segmentCount} active exclusive segments`,
        explanation: `Customer ${conflict.customerCode} holds ${conflict.segmentCount} active exclusive segments (${memberships
          .map((m) => m.segment.name)
          .join(', ')}). Exclusive segments are single-assignment: the later membership (${memberships[memberships.length - 1]?.membershipCode}) came from a legacy import and must be corrected, because downstream targeting and value reporting would double count this customer.`,
        detectionRuleId: 'SEG-EXCL-01',
        evidence: { segments } as Prisma.InputJsonValue,
      });

      await prisma.segmentMembership.updateMany({
        where: { id: { in: memberships.map((m) => m.id) } },
        data: { isExclusiveConflict: true },
      });

      detected += 1;
    }

    return { category: 'SEGMENT_CONFLICT', detected, blocked: 0, durationMs: Date.now() - startedAt };
  }

  /**
   * CASE 2 - a promotional recommendation that is ELIGIBLE for a customer
   * without marketing consent.  The violating recommendation is blocked, its
   * prior state is written to the audit log, and an exception preserves the
   * evidence.  Nothing is deleted.
   */
  async enforceConsent(): Promise<DetectionSummary> {
    const startedAt = Date.now();
    const violations = await prisma.$queryRaw<
      Array<{
        id: number;
        recommendationCode: string;
        customerId: number;
        customerCode: string;
        actionSlug: string;
        actionName: string;
        channel: string;
        eligibility: string;
        suppressionResult: string;
        status: string;
      }>
    >`
      SELECT r.id,
             r."recommendationCode" AS "recommendationCode",
             r."customerId" AS "customerId",
             c."customerCode" AS "customerCode",
             a.slug AS "actionSlug",
             a.name AS "actionName",
             a.channel::text AS "channel",
             r.eligibility::text AS "eligibility",
             r."suppressionResult"::text AS "suppressionResult",
             r.status::text AS "status"
      FROM recommendations r
      JOIN action_catalog a ON a.id = r."actionId"
      JOIN customers c ON c.id = r."customerId"
      WHERE a."requiresMarketingConsent" = true
        AND r.eligibility = 'ELIGIBLE'
        AND NOT EXISTS (
          SELECT 1 FROM consents k
          WHERE k."customerId" = r."customerId"
            AND k.purpose = 'MARKETING'
            AND k.channel::text = a.channel::text
            AND k.status = 'GRANTED'
            AND k."effectiveTo" IS NULL
        )
    `;

    let blocked = 0;
    for (const violation of violations) {
      const consent = await prisma.consent.findFirst({
        where: { customerId: violation.customerId, purpose: 'MARKETING', effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      });

      await this.createException({
        category: 'CONSENT_VIOLATION',
        severity: 'CRITICAL',
        entityType: 'Recommendation',
        entityId: violation.recommendationCode,
        customerId: violation.customerId,
        recommendationId: violation.id,
        expectedValue: 'suppressed (no marketing consent)',
        actualValue: violation.eligibility,
        explanation: `Promotional action "${violation.actionName}" was marked ELIGIBLE for ${violation.customerCode} although the customer has no active ${violation.channel} marketing consent${
          consent?.withdrawnAt ? ` (withdrawn ${consent.withdrawnAt.toISOString().slice(0, 10)})` : ''
        }. The action is blocked, the recommendation is marked SUPPRESSED, and the original eligibility is preserved in the audit trail.`,
        detectionRuleId: 'CONSENT-ENF-01',
        evidence: {
          consentRecord: consent?.consentCode ?? null,
          consentStatus: consent?.status ?? null,
          withdrawnAt: consent?.withdrawnAt?.toISOString() ?? null,
          originalEligibility: violation.eligibility,
          originalSuppression: violation.suppressionResult,
          originalStatus: violation.status,
        } as Prisma.InputJsonValue,
      });

      await auditService.record({
        actor: 'consent-guard',
        action: 'CONSENT_VIOLATION_BLOCKED',
        entityType: 'Recommendation',
        entityId: violation.recommendationCode,
        customerId: violation.customerId,
        payload: {
          previousEligibility: violation.eligibility,
          previousSuppression: violation.suppressionResult,
          previousStatus: violation.status,
          newEligibility: 'SUPPRESSED',
          reason: 'No active marketing consent for the action channel',
          consentRecord: consent?.consentCode ?? null,
        },
      });

      await prisma.recommendation.update({
        where: { id: violation.id },
        data: { eligibility: 'SUPPRESSED', suppressionResult: 'SUPPRESSED_CONSENT', status: 'SUPPRESSED' },
      });

      const existingReason = await prisma.recommendationReason.findFirst({
        where: { recommendationId: violation.id, reasonCode: 'CONSENT_ENFORCEMENT' },
      });
      if (!existingReason) {
        await prisma.recommendationReason.create({
          data: {
            recommendationId: violation.id,
            reasonCode: 'CONSENT_ENFORCEMENT',
            label: 'Blocked by consent guard',
            detail: `Marketing consent for ${violation.channel} is not granted. The recommendation was downgraded from ELIGIBLE to SUPPRESSED by the consent guard on ${new Date().toISOString().slice(0, 10)}.`,
            weight: new Prisma.Decimal(6),
          },
        });
      }

      blocked += 1;
    }

    return { category: 'CONSENT_VIOLATION', detected: violations.length, blocked, durationMs: Date.now() - startedAt };
  }

  /** CASE 3 - refunds exist on lines but the order header did not net them. */
  async detectReturnReconciliation(): Promise<DetectionSummary> {
    const startedAt = Date.now();
    const rows = await prisma.$queryRaw<
      Array<{
        orderId: number;
        orderCode: string;
        customerId: number;
        customerCode: string;
        grossTotal: string;
        returnedAmount: string;
        netTotal: string;
        refund_sum: string;
        line_count: number;
      }>
    >`
      WITH refunds AS (
        SELECT "orderId", SUM("refundAmount") AS refund_sum, COUNT(*)::int AS line_count
        FROM order_lines
        GROUP BY "orderId"
        HAVING SUM("refundAmount") > 0
      )
      SELECT o.id AS "orderId", o."orderCode" AS "orderCode", o."customerId" AS "customerId",
             c."customerCode" AS "customerCode", o."grossTotal"::text AS "grossTotal",
             o."returnedAmount"::text AS "returnedAmount", o."netTotal"::text AS "netTotal",
             f.refund_sum::text AS "refund_sum", f.line_count
      FROM orders o
      JOIN refunds f ON f."orderId" = o.id
      JOIN customers c ON c.id = o."customerId"
      WHERE o."returnedAmount" <> f.refund_sum
         OR o."netTotal" <> (o."grossTotal" - f.refund_sum)
    `;

    for (const row of rows) {
      const gross = Number(row.grossTotal);
      const refund = Number(row.refund_sum);
      const expectedNet = (gross - refund).toFixed(2);
      const discrepancy = (Number(row.netTotal) - Number(expectedNet)).toFixed(2);

      await this.createException({
        category: 'RETURN_NOT_NETTED',
        severity: 'HIGH',
        entityType: 'Order',
        entityId: row.orderCode,
        customerId: Number(row.customerId),
        expectedValue: `returned ${refund.toFixed(2)} / net ${expectedNet}`,
        actualValue: `returned ${Number(row.returnedAmount).toFixed(2)} / net ${Number(row.netTotal).toFixed(2)}`,
        explanation: `Order ${row.orderCode} contains ${row.line_count} refunded line(s) totalling ${refund.toFixed(
          2,
        )} but the order header reports returnedAmount ${Number(row.returnedAmount).toFixed(
          2,
        )}. Returned goods were not deducted from spend, overstating net revenue by ${discrepancy}. The corrected monetary value is derived from order lines and applied in RFM scoring.`,
        detectionRuleId: 'RET-01',
        evidence: {
          grossTotal: gross,
          refundSum: refund,
          expectedNetTotal: Number(expectedNet),
          actualNetTotal: Number(row.netTotal),
          discrepancy: Number(discrepancy),
          correctionSource: 'order_lines.refundAmount',
        } as Prisma.InputJsonValue,
      });
    }

    return { category: 'RETURN_NOT_NETTED', detected: rows.length, blocked: 0, durationMs: Date.now() - startedAt };
  }

  /** CASE 4 - outcome attributed to an action that the recommendation never proposed. */
  async detectOutcomeAttribution(): Promise<DetectionSummary> {
    const startedAt = Date.now();
    const rows = await prisma.$queryRaw<
      Array<{
        outcomeId: number;
        outcomeCode: string;
        customerId: number;
        customerCode: string;
        recommendationCode: string;
        recommendationAction: string;
        recordedAction: string;
        recommendationActionId: number;
        recordedActionId: number;
        revenue: string;
      }>
    >`
      SELECT o.id AS "outcomeId", o."outcomeCode" AS "outcomeCode", o."customerId" AS "customerId",
             c."customerCode" AS "customerCode", r."recommendationCode" AS "recommendationCode",
             ra.slug AS "recommendationAction", oa.slug AS "recordedAction",
             r."actionId" AS "recommendationActionId", o."actionId" AS "recordedActionId",
             o."revenueAttributed"::text AS revenue
      FROM action_outcomes o
      JOIN recommendations r ON r.id = o."recommendationId"
      JOIN action_catalog ra ON ra.id = r."actionId"
      JOIN action_catalog oa ON oa.id = o."actionId"
      JOIN customers c ON c.id = o."customerId"
      WHERE o."actionId" <> r."actionId"
    `;

    for (const row of rows) {
      await this.createException({
        category: 'OUTCOME_ATTRIBUTION',
        severity: 'HIGH',
        entityType: 'ActionOutcome',
        entityId: row.outcomeCode,
        customerId: Number(row.customerId),
        expectedValue: row.recommendationAction,
        actualValue: row.recordedAction,
        explanation: `Outcome ${row.outcomeCode} is recorded against action "${row.recordedAction}" but its recommendation ${row.recommendationCode} proposed "${row.recommendationAction}". Revenue of ${Number(
          row.revenue,
        ).toFixed(2)} cannot be attributed to the recommendation. The original outcome row is preserved unchanged so the downstream defect stays visible.`,
        detectionRuleId: 'ATTRIB-01',
        evidence: {
          recommendationCode: row.recommendationCode,
          recommendationActionId: Number(row.recommendationActionId),
          recommendationAction: row.recommendationAction,
          recordedActionId: Number(row.recordedActionId),
          recordedAction: row.recordedAction,
          revenue: Number(row.revenue),
        } as Prisma.InputJsonValue,
      });

      await prisma.actionOutcome.update({ where: { id: Number(row.outcomeId) }, data: { isAttributionValid: false } });
      await auditService.record({
        actor: 'attribution-guard',
        action: 'OUTCOME_ATTRIBUTION_FLAGGED',
        entityType: 'ActionOutcome',
        entityId: row.outcomeCode,
        customerId: Number(row.customerId),
        payload: { expected: row.recommendationAction, actual: row.recordedAction, revenue: Number(row.revenue) },
      });
    }

    return { category: 'OUTCOME_ATTRIBUTION', detected: rows.length, blocked: 0, durationMs: Date.now() - startedAt };
  }

  /** Runs every detector.  Order matters: consent is enforced before reporting. */
  async runAll(): Promise<DetectionRunResult> {
    const startedAt = new Date().toISOString();
    const detectors: DetectionSummary[] = [];
    detectors.push(await this.detectSegmentConflicts());
    detectors.push(await this.enforceConsent());
    detectors.push(await this.detectReturnReconciliation());
    detectors.push(await this.detectOutcomeAttribution());

    const totalOpen = await prisma.exceptionRecord.count({ where: { status: 'OPEN' } });
    logger.info('detectors completed', { detectors: detectors.map((d) => `${d.category}:${d.detected}`) });

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      detectors,
      totalOpen,
    };
  }

  async resolve(id: number, status: 'INVESTIGATING' | 'RESOLVED' | 'IGNORED', notes?: string, actor = 'analyst') {
    const existing = await prisma.exceptionRecord.findUnique({ where: { id } });
    if (!existing) return null;
    const updated = await prisma.exceptionRecord.update({
      where: { id },
      data: {
        status,
        resolutionNotes: notes ?? existing.resolutionNotes,
        resolvedAt: status === 'RESOLVED' || status === 'IGNORED' ? new Date() : null,
      },
    });
    await auditService.record({
      actor,
      action: 'EXCEPTION_STATUS_CHANGED',
      entityType: 'ExceptionRecord',
      entityId: existing.exceptionCode,
      customerId: existing.customerId,
      payload: { from: existing.status, to: status, notes: notes ?? null },
    });
    return updated;
  }
}

export const detectorService = new DetectorService();
