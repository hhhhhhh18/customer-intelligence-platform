/**
 * Database-level validation engine.
 *
 * Runs real SQL against the loaded dataset.  No check is satisfied by a
 * constant: each query returns `checked` and `failures` counts, and the run is
 * persisted with per-rule results so the data-quality page can show exactly
 * which rule failed on which record.
 *
 * Two rules are documented as having exactly one known-bad row because the
 * brief requires those defects to exist (returns not netted, outcome
 * attribution mismatch) plus the injected duplicate segment membership.  They
 * are reported as WARNING with expectedAnomaly = true, never hidden.
 */
import { prisma, Prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { loadGroundTruth, evaluateAgainstGroundTruth } from './ground-truth.service';

export interface CheckRow {
  checked: number;
  failures: number;
  sample?: string | null;
}

interface CheckDefinition {
  ruleId: string;
  name: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  sql: Prisma.Sql;
  expectedFailures?: number;
  description: string;
}

const CHECKS: CheckDefinition[] = [
  {
    ruleId: 'DQ-VOL-01',
    name: 'Dataset is populated',
    category: 'VOLUME',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END::int AS failures
                    FROM customers`,
    description: 'At least one customer must exist before analytics can run.',
  },
  {
    ruleId: 'DQ-FK-01',
    name: 'orders.customerId references an existing customer',
    category: 'REFERENTIAL_INTEGRITY',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE c.id IS NULL)::int AS failures
                    FROM orders o LEFT JOIN customers c ON c.id = o."customerId"`,
    description: 'Foreign key integrity for orders -> customers.',
  },
  {
    ruleId: 'DQ-FK-02',
    name: 'order_lines.orderId references an existing order',
    category: 'REFERENTIAL_INTEGRITY',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE o.id IS NULL)::int AS failures
                    FROM order_lines l LEFT JOIN orders o ON o.id = l."orderId"`,
    description: 'Foreign key integrity for order_lines -> orders.',
  },
  {
    ruleId: 'DQ-FK-03',
    name: 'order_lines.productId references an existing product',
    category: 'REFERENTIAL_INTEGRITY',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE p.id IS NULL)::int AS failures
                    FROM order_lines l LEFT JOIN products p ON p.id = l."productId"`,
    description: 'Foreign key integrity for order_lines -> products.',
  },
  {
    ruleId: 'DQ-FK-04',
    name: 'engagement_events.customerId references an existing customer',
    category: 'REFERENTIAL_INTEGRITY',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE c.id IS NULL)::int AS failures
                    FROM engagement_events e LEFT JOIN customers c ON c.id = e."customerId"`,
    description: 'Foreign key integrity for engagement events.',
  },
  {
    ruleId: 'DQ-FK-05',
    name: 'support_cases.customerId references an existing customer',
    category: 'REFERENTIAL_INTEGRITY',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE c.id IS NULL)::int AS failures
                    FROM support_cases s LEFT JOIN customers c ON c.id = s."customerId"`,
    description: 'Foreign key integrity for support cases.',
  },
  {
    ruleId: 'DQ-FK-06',
    name: 'consents.customerId references an existing customer',
    category: 'REFERENTIAL_INTEGRITY',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE c.id IS NULL)::int AS failures
                    FROM consents k LEFT JOIN customers c ON c.id = k."customerId"`,
    description: 'Foreign key integrity for consent history.',
  },
  {
    ruleId: 'DQ-FK-07',
    name: 'recommendations reference valid customer, action and segment',
    category: 'REFERENTIAL_INTEGRITY',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE c.id IS NULL OR a.id IS NULL OR (r."segmentId" IS NOT NULL AND s.id IS NULL))::int AS failures
                    FROM recommendations r
                    LEFT JOIN customers c ON c.id = r."customerId"
                    LEFT JOIN action_catalog a ON a.id = r."actionId"
                    LEFT JOIN segment_rules s ON s.id = r."segmentId"`,
    description: 'Recommendations must never point at missing parents.',
  },
  {
    ruleId: 'DQ-FK-08',
    name: 'action_outcomes reference valid recommendation and action',
    category: 'REFERENTIAL_INTEGRITY',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE r.id IS NULL OR a.id IS NULL)::int AS failures
                    FROM action_outcomes o
                    LEFT JOIN recommendations r ON r.id = o."recommendationId"
                    LEFT JOIN action_catalog a ON a.id = o."actionId"`,
    description: 'Outcome records must reference a real recommendation and action.',
  },
  {
    ruleId: 'DQ-DUP-01',
    name: 'Customer email addresses are unique',
    category: 'DUPLICATE',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           (SELECT COUNT(*)::int FROM (SELECT email FROM customers GROUP BY email HAVING COUNT(*) > 1) d) AS failures
                    FROM customers`,
    description: 'Duplicate emails break identity resolution.',
  },
  {
    ruleId: 'DQ-DUP-02',
    name: 'Order codes are unique',
    category: 'DUPLICATE',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           (SELECT COUNT(*)::int FROM (SELECT "orderCode" FROM orders GROUP BY "orderCode" HAVING COUNT(*) > 1) d) AS failures
                    FROM orders`,
    description: 'Business identifiers must be unique.',
  },
  {
    ruleId: 'DQ-DUP-03',
    name: 'Order line numbers are unique per order',
    category: 'DUPLICATE',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           (SELECT COUNT(*)::int FROM (
                              SELECT "orderId", "lineNumber" FROM order_lines GROUP BY 1, 2 HAVING COUNT(*) > 1
                            ) d) AS failures
                    FROM order_lines`,
    description: 'Duplicate line numbers make line-level reconciliation ambiguous.',
  },
  {
    ruleId: 'DQ-DUP-04',
    name: 'One current consent record per customer / channel / purpose',
    category: 'CONSENT_LIFECYCLE',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           (SELECT COUNT(*)::int FROM (
                              SELECT "customerId", channel, purpose FROM consents
                              WHERE "effectiveTo" IS NULL GROUP BY 1, 2, 3 HAVING COUNT(*) > 1
                            ) d) AS failures
                    FROM consents WHERE "effectiveTo" IS NULL`,
    description: 'Append-only consent history must expose a single current state.',
  },
  {
    ruleId: 'DQ-ID-01',
    name: 'Customer identifiers follow CUS-000000',
    category: 'IDENTIFIER_FORMAT',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE "customerCode" !~ '^CUS-[0-9]{6}$')::int AS failures
                    FROM customers`,
    description: 'Deterministic, zero-padded identifiers.',
  },
  {
    ruleId: 'DQ-ID-02',
    name: 'Order identifiers follow ORD-YYYY-000000',
    category: 'IDENTIFIER_FORMAT',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE "orderCode" !~ '^ORD-[0-9]{4}-[0-9]{6}$')::int AS failures
                    FROM orders`,
    description: 'Deterministic, zero-padded identifiers.',
  },
  {
    ruleId: 'DQ-AR-01',
    name: 'Order subtotal equals the sum of its line totals',
    category: 'ORDER_ARITHMETIC',
    severity: 'CRITICAL',
    sql: Prisma.sql`WITH line_totals AS (
                      SELECT "orderId", SUM("lineTotal") AS total FROM order_lines GROUP BY "orderId"
                    )
                    SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE COALESCE(lt.total, 0) <> o.subtotal)::int AS failures
                    FROM orders o LEFT JOIN line_totals lt ON lt."orderId" = o.id`,
    description: 'Header totals must be derived from lines.',
  },
  {
    ruleId: 'DQ-AR-02',
    name: 'grossTotal = subtotal + shipping + tax',
    category: 'ORDER_ARITHMETIC',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE "grossTotal" <> ("subtotal" + "shippingAmount" + "taxAmount"))::int AS failures
                    FROM orders`,
    description: 'Order arithmetic must be internally consistent.',
  },
  {
    ruleId: 'DQ-RC-01',
    name: 'Returned amounts are netted from order net total',
    category: 'RECONCILIATION',
    severity: 'CRITICAL',
    expectedFailures: 1,
    sql: Prisma.sql`WITH refunds AS (
                      SELECT "orderId", SUM("refundAmount") AS refund FROM order_lines GROUP BY "orderId" HAVING SUM("refundAmount") > 0
                    )
                    SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (
                             WHERE o."returnedAmount" <> f.refund OR o."netTotal" <> (o."grossTotal" - f.refund)
                           )::int AS failures
                    FROM orders o JOIN refunds f ON f."orderId" = o.id`,
    description: 'Returned goods must reduce net spend.',
  },
  {
    ruleId: 'DQ-CN-01',
    name: 'Withdrawn consent rows carry a withdrawal timestamp',
    category: 'CONSENT_LIFECYCLE',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE "withdrawnAt" IS NULL)::int AS failures
                    FROM consents WHERE status = 'WITHDRAWN'`,
    description: 'Consent withdrawal must be evidenced and timestamped.',
  },
  {
    ruleId: 'DQ-CN-02',
    name: 'Consent effective windows are ordered',
    category: 'CONSENT_LIFECYCLE',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE "effectiveTo" IS NOT NULL AND "effectiveTo" <= "effectiveFrom")::int AS failures
                    FROM consents`,
    description: 'effectiveTo must be after effectiveFrom.',
  },
  {
    ruleId: 'DQ-SEG-01',
    name: 'A customer holds at most one active exclusive segment',
    category: 'SEGMENT_MEMBERSHIP',
    severity: 'CRITICAL',
    expectedFailures: 1,
    sql: Prisma.sql`SELECT COUNT(DISTINCT m."customerId")::int AS checked,
                           (SELECT COUNT(*)::int FROM (
                              SELECT m2."customerId" FROM segment_memberships m2
                              JOIN segment_rules s2 ON s2.id = m2."segmentId"
                              WHERE m2.status = 'ACTIVE' AND s2."isExclusive" = true
                              GROUP BY m2."customerId" HAVING COUNT(*) > 1
                            ) d) AS failures
                    FROM segment_memberships m`,
    description: 'Exclusive segments are single-assignment.',
  },
  {
    ruleId: 'DQ-SEG-02',
    name: 'Every customer has an active segment membership',
    category: 'SEGMENT_MEMBERSHIP',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE NOT EXISTS (
                             SELECT 1 FROM segment_memberships m WHERE m."customerId" = c.id AND m.status = 'ACTIVE'
                           ))::int AS failures
                    FROM customers c`,
    description: 'Unassigned customers indicate a segmentation gap.',
  },
  {
    ruleId: 'DQ-REC-01',
    name: 'No promotional action is ELIGIBLE without marketing consent',
    category: 'RECOMMENDATION_ELIGIBILITY',
    severity: 'CRITICAL',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (
                             WHERE r.eligibility = 'ELIGIBLE' AND a."requiresMarketingConsent" = true
                               AND NOT EXISTS (
                                 SELECT 1 FROM consents k
                                 WHERE k."customerId" = r."customerId" AND k.purpose = 'MARKETING'
                                   AND k.channel::text = a.channel::text AND k.status = 'GRANTED' AND k."effectiveTo" IS NULL
                               )
                           )::int AS failures
                    FROM recommendations r JOIN action_catalog a ON a.id = r."actionId"`,
    description: 'Consent must be enforced before eligibility. Post-guard this must be zero.',
  },
  {
    ruleId: 'DQ-REC-02',
    name: 'Every recommendation has at least one reason',
    category: 'RECOMMENDATION_ELIGIBILITY',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE NOT EXISTS (
                             SELECT 1 FROM recommendation_reasons rr WHERE rr."recommendationId" = r.id
                           ))::int AS failures
                    FROM recommendations r`,
    description: 'A recommendation without a reason is not explainable.',
  },
  {
    ruleId: 'DQ-OUT-01',
    name: 'Outcome action matches the recommendation action',
    category: 'ATTRIBUTION',
    severity: 'HIGH',
    expectedFailures: 1,
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE o."actionId" <> r."actionId")::int AS failures
                    FROM action_outcomes o JOIN recommendations r ON r.id = o."recommendationId"`,
    description: 'Attribution requires the outcome to belong to the recommended action.',
  },
  {
    ruleId: 'DQ-DT-01',
    name: 'Orders are not dated in the future relative to the dataset reference',
    category: 'DATE_ORDERING',
    severity: 'MEDIUM',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE o."orderDate" > g."referenceDate")::int AS failures
                    FROM orders o
                    CROSS JOIN (SELECT "referenceDate" FROM generation_runs ORDER BY "startedAt" DESC LIMIT 1) g`,
    description: 'Future-dated orders would corrupt recency scoring.',
  },
  {
    ruleId: 'DQ-DT-02',
    name: 'Orders are not dated before the customer signed up',
    category: 'DATE_ORDERING',
    severity: 'HIGH',
    sql: Prisma.sql`SELECT COUNT(*)::int AS checked,
                           COUNT(*) FILTER (WHERE o."orderDate" < c."signupDate")::int AS failures
                    FROM orders o JOIN customers c ON c.id = o."customerId"`,
    description: 'Chronology must be consistent across related records.',
  },
];

export interface ValidationSummary {
  runCode: string;
  totalRecordsChecked: number;
  checksPassed: number;
  checksFailed: number;
  warningCount: number;
  exceptionCount: number;
  score: number;
  durationMs: number;
}

export class ValidationService {
  async run(options: { actor?: string; includeGroundTruth?: boolean } = {}) {
    const startedAt = Date.now();
    const now = new Date();
    const runCode = `DQ-${now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`;
    const run = await prisma.dataQualityRun.create({
      data: {
        runCode,
        totalRecordsChecked: 0,
        checksPassed: 0,
        checksFailed: 0,
        warningCount: 0,
        exceptionCount: 0,
        score: new Prisma.Decimal(0),
        summary: {},
      },
    });

    const results: Array<Record<string, unknown>> = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;
    let recordsChecked = 0;

    for (const check of CHECKS) {
      let row: CheckRow;
      try {
        const rows = await prisma.$queryRaw<CheckRow[]>(check.sql);
        row = rows[0] ?? { checked: 0, failures: 0 };
      } catch (error) {
        row = { checked: 0, failures: 1, sample: error instanceof Error ? error.message : 'query failed' };
      }

      const checked = Number(row.checked ?? 0);
      const failures = Number(row.failures ?? 0);
      const expected = check.expectedFailures ?? 0;
      const isExpectedAnomaly = expected > 0 && failures === expected;
      const isPass = failures === expected;

      recordsChecked += checked;
      if (isPass) passed += 1;
      else failed += 1;
      if (isExpectedAnomaly) warnings += 1;

      const outcome: 'PASS' | 'WARNING' | 'FAIL' = isPass ? (isExpectedAnomaly ? 'WARNING' : 'PASS') : 'FAIL';

      results.push({
        ruleId: check.ruleId,
        name: check.name,
        category: check.category,
        severity: check.severity,
        description: check.description,
        checked,
        failures,
        expectedFailures: expected,
        expectedAnomaly: isExpectedAnomaly,
        outcome,
      });

      if (!isPass) {
        await prisma.dataQualityIssue.create({
          data: {
            runId: run.id,
            ruleId: check.ruleId,
            category: check.category,
            outcome: 'FAIL',
            severity: check.severity,
            entityType: check.category,
            entityId: null,
            message: `${check.name} failed for ${failures} of ${checked} checked records (expected ${expected}).`,
            expected: String(expected),
            actual: String(failures),
          },
        });
      }
    }

    // ---- ground-truth evaluation (read-only, never fed back to engines) --
    const groundTruth = await loadGroundTruth();
    const evaluation = groundTruth ? await evaluateAgainstGroundTruth(groundTruth) : null;

    const exceptionCount = await prisma.exceptionRecord.count();
    const totalChecks = CHECKS.length;
    // Expected anomalies are required by the brief and match their documented
    // count, so they do not reduce the score; any unexpected failure does.
    const score = Number(((passed / totalChecks) * 100).toFixed(2));

    const summary = {
      checks: results,
      evaluation,
      volumes: await this.volumes(),
      ruleVersion: 'dq-v1.0.0',
      executedAt: now.toISOString(),
    };

    await prisma.dataQualityRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        totalRecordsChecked: recordsChecked,
        checksPassed: passed,
        checksFailed: failed,
        warningCount: warnings,
        exceptionCount,
        score: new Prisma.Decimal(score),
        summary: summary as Prisma.InputJsonValue,
      },
    });

    logger.info('validation completed', { runCode, passed, failed, warnings, score });

    return {
      runCode,
      totalRecordsChecked: recordsChecked,
      checksPassed: passed,
      checksFailed: failed,
      warningCount: warnings,
      exceptionCount,
      score,
      durationMs: Date.now() - startedAt,
      results,
      evaluation,
    };
  }

  async volumes() {
    const [customers, orders, orderLines, events, cases, consents, recommendations, outcomes, exceptions] =
      await Promise.all([
        prisma.customer.count(),
        prisma.order.count(),
        prisma.orderLine.count(),
        prisma.engagementEvent.count(),
        prisma.supportCase.count(),
        prisma.consent.count(),
        prisma.recommendation.count(),
        prisma.actionOutcome.count(),
        prisma.exceptionRecord.count(),
      ]);
    return { customers, orders, orderLines, events, supportCases: cases, consents, recommendations, outcomes, exceptions };
  }

  async latest() {
    return prisma.dataQualityRun.findFirst({ orderBy: { startedAt: 'desc' } });
  }

  async history(limit = 10) {
    return prisma.dataQualityRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
  }

  checkCatalogue() {
    return CHECKS.map((c) => ({
      ruleId: c.ruleId,
      name: c.name,
      category: c.category,
      severity: c.severity,
      description: c.description,
      expectedFailures: c.expectedFailures ?? 0,
    }));
  }
}

export const validationService = new ValidationService();


