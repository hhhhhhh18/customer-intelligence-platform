/**
 * Applies the labelled integration anomalies from the data-engine manifest.
 *
 * These two defects cannot exist before segmentation/recommendation/outcome
 * records exist, so they are applied here.  This script is the *injector*; the
 * detection code never reads the manifest.  Case 3 (returns not netted) is a
 * pure data defect and is already part of the generated dataset.
 */
import fs from 'fs';
import path from 'path';
import { prisma, Prisma } from '../db/prisma';
import { recommendationCode } from '../utils/ids';
import { auditService } from '../modules/audit/audit.service';

interface Manifest {
  case1_segment_conflict?: {
    anomalyId: string;
    customerCode: string;
    primarySegmentSlug: string;
    secondarySegmentSlug: string;
    explanation: string;
  };
  case2_consent_violation?: {
    anomalyId: string;
    customerCode?: string;
    customerId?: number;
    actionSlug: string;
    explanation: string;
  };
  case4_outcome_attribution?: {
    anomalyId: string;
    targetOutcomeOrdinal: number;
    explanation: string;
  };
}

const MANIFEST_PATH = path.resolve(process.cwd(), '..', 'data-engine', 'ground_truth', 'injection_manifest.json');

async function nextRecommendationSequence(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING("recommendationCode" FROM 10) AS INTEGER)), 0) AS max FROM recommendations
  `;
  return Number(rows[0]?.max ?? 0) + 1;
}

export async function injectAnomalies() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Injection manifest not found at ${MANIFEST_PATH}. Generate a dataset first.`);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
  const results: Record<string, string> = {};

  // ---- CASE 1: conflicting exclusive segment ---------------------------
  if (manifest.case1_segment_conflict) {
    const spec = manifest.case1_segment_conflict;
    const customer = await prisma.customer.findUnique({ where: { customerCode: spec.customerCode } });
    const secondary = await prisma.segmentRule.findUnique({ where: { slug: spec.secondarySegmentSlug } });
    if (!customer || !secondary) throw new Error('Case 1 target customer or segment missing');

    const existingLegacy = await prisma.segmentMembership.findFirst({
      where: { customerId: customer.id, segmentId: secondary.id, ruleVersion: 'legacy-import-v0' },
    });

    if (existingLegacy) {
      results.case1 = `already injected (${existingLegacy.membershipCode})`;
    } else {
      const reference = await prisma.segmentMembership.findFirst({
        where: { customerId: customer.id, status: 'ACTIVE' },
        orderBy: { id: 'asc' },
      });
      await prisma.segmentMembership.create({
        data: {
          membershipCode: `MEM-${secondary.segmentCode}-${customer.customerCode}-IMP`,
          segmentId: secondary.id,
          customerId: customer.id,
          assignedAt: new Date(),
          effectiveFrom: new Date(),
          status: 'ACTIVE',
          ruleVersion: 'legacy-import-v0',
          recencyDays: reference?.recencyDays ?? 0,
          frequency: reference?.frequency ?? 0,
          monetary: reference?.monetary ?? new Prisma.Decimal(0),
          rScore: reference?.rScore ?? 0,
          fScore: reference?.fScore ?? 0,
          mScore: reference?.mScore ?? 0,
          rfmScore: reference?.rfmScore ?? 0,
          serviceCost: reference?.serviceCost ?? new Prisma.Decimal(0),
          assignmentReason:
            'Imported from legacy audience file during CRM migration; no RFM evaluation was performed on this row.',
          decisionInputs: { source: 'legacy-import-v0' } as Prisma.InputJsonValue,
        },
      });
      await auditService.record({
        actor: 'legacy-import',
        action: 'SEGMENT_MEMBERSHIP_IMPORTED',
        entityType: 'Customer',
        entityId: customer.customerCode,
        customerId: customer.id,
        payload: { segment: spec.secondarySegmentSlug, ruleVersion: 'legacy-import-v0', anomalyId: spec.anomalyId },
      });
      results.case1 = `injected second active membership for ${customer.customerCode}`;
    }
  }

  // ---- CASE 2: promotional recommendation without consent --------------
  if (manifest.case2_consent_violation) {
    const spec = manifest.case2_consent_violation;
    const customer = spec.customerCode
      ? await prisma.customer.findUnique({ where: { customerCode: spec.customerCode } })
      : await prisma.customer.findUnique({ where: { id: Number(spec.customerId) } });
    const action = await prisma.actionCatalog.findUnique({ where: { slug: spec.actionSlug } });
    if (!customer || !action) throw new Error('Case 2 target customer or action missing');

    const existing = await prisma.recommendation.findFirst({
      where: { customerId: customer.id, sourcePipeline: 'legacy-campaign-service-v0' },
    });

    if (existing) {
      results.case2 = `already injected (${existing.recommendationCode})`;
    } else {
      const membership = await prisma.segmentMembership.findFirst({
        where: { customerId: customer.id, status: 'ACTIVE' },
        include: { segment: true },
      });
      const sequence = await nextRecommendationSequence();
      const created = await prisma.recommendation.create({
        data: {
          recommendationCode: recommendationCode(sequence),
          customerId: customer.id,
          segmentId: membership?.segmentId ?? null,
          actionId: action.id,
          runId: 'LEGACY-IMPORT',
          recommendedAt: new Date(),
          eligibility: 'ELIGIBLE',
          suppressionResult: 'NOT_SUPPRESSED',
          status: 'PENDING',
          score: new Prisma.Decimal(1200),
          explanation: `Legacy campaign service recommended ${action.name} based on segment membership alone. No consent check was performed by that service.`,
          inputMetrics: {
            source: 'legacy-campaign-service-v0',
            consentChecked: false,
            segment: membership?.segment?.slug ?? 'unknown',
          } as Prisma.InputJsonValue,
          ruleVersion: 'nba-v0.9.0',
          sourcePipeline: 'legacy-campaign-service-v0',
        },
      });
      await prisma.recommendationReason.create({
        data: {
          recommendationId: created.id,
          reasonCode: 'LEGACY_SEGMENT_RULE',
          label: 'Legacy segment-only rule',
          detail:
            'The legacy service selected customers from the segment audience without evaluating marketing consent or support status.',
          weight: new Prisma.Decimal(1),
        },
      });
      await auditService.record({
        actor: 'legacy-campaign-service',
        action: 'RECOMMENDATION_CREATED',
        entityType: 'Recommendation',
        entityId: created.recommendationCode,
        customerId: customer.id,
        payload: { anomalyId: spec.anomalyId, eligibility: 'ELIGIBLE', consentChecked: false },
      });
      results.case2 = `injected ELIGIBLE promotional recommendation ${created.recommendationCode} for ${customer.customerCode}`;
    }
  }

  // ---- CASE 4: outcome attributed to the wrong action ------------------
  if (manifest.case4_outcome_attribution) {
    const spec = manifest.case4_outcome_attribution;
    const outcomes = await prisma.actionOutcome.findMany({
      where: { status: 'SUCCESS', isAttributionValid: true },
      orderBy: { outcomeCode: 'asc' },
      take: Math.max(spec.targetOutcomeOrdinal, 1),
      include: { recommendation: { include: { action: true } } },
    });
    const target = outcomes[outcomes.length - 1];
    if (!target) throw new Error('Case 4 requires at least one successful outcome');

    if (target.actionId !== target.recommendation.actionId) {
      results.case4 = `already injected (${target.outcomeCode})`;
    } else {
      const wrongAction = await prisma.actionCatalog.findFirst({
        where: { id: { not: target.recommendation.actionId } },
        orderBy: { id: 'asc' },
      });
      if (!wrongAction) throw new Error('No alternative action available for case 4');

      await prisma.actionOutcome.update({
        where: { id: target.id },
        data: { actionId: wrongAction.id },
      });
      await auditService.record({
        actor: 'downstream-crm-webhook',
        action: 'OUTCOME_RECORDED_WITH_MISMATCHED_ACTION',
        entityType: 'ActionOutcome',
        entityId: target.outcomeCode,
        customerId: target.customerId,
        payload: {
          anomalyId: spec.anomalyId,
          recordedAction: wrongAction.slug,
          recommendationAction: target.recommendation.action.slug,
        },
      });
      results.case4 = `injected attribution mismatch on ${target.outcomeCode} (${wrongAction.slug} vs ${target.recommendation.action.slug})`;
    }
  }

  return results;
}

if (require.main === module) {
  injectAnomalies()
    .then(async (results) => {
      console.log('[inject]', results);
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('[inject] failed', error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
