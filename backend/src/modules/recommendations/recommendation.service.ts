import { prisma, Prisma } from '../../db/prisma';
import { actionCode, recommendationCode, runCode } from '../../utils/ids';
import { logger } from '../../utils/logger';
import { auditService } from '../audit/audit.service';
import { ensureSegmentRules } from '../segmentation/segmentation.service';
import { ACTION_CATALOG } from './action-catalog';
import { evaluateRecommendation, RecommendationContext } from './recommendation-engine';
import {
  RecommendationFilters,
  RecommendationsRepository,
  RecommendationRunRepository,
} from './recommendations.repository';

export interface RecommendationRunSummary {
  runCode: string;
  processed: number;
  eligible: number;
  suppressed: number;
  noAction: number;
  consentSuppressed: number;
  durationMs: number;
  byAction: Array<{ action: string; count: number }>;
}

export async function ensureActionCatalog() {
  const existing = await prisma.actionCatalog.findMany();
  const bySlug = new Map(existing.map((a) => [a.slug, a]));
  for (let index = 0; index < ACTION_CATALOG.length; index += 1) {
    const def = ACTION_CATALOG[index];
    if (bySlug.has(def.slug)) continue;
    await prisma.actionCatalog.create({
      data: {
        actionCode: actionCode(index + 1),
        slug: def.slug,
        name: def.name,
        description: def.description,
        actionType: def.actionType,
        channel: def.channel as never,
        isPromotional: def.isPromotional,
        requiresMarketingConsent: def.requiresMarketingConsent,
        costPerContact: def.costPerContact,
        expectedValue: def.expectedValue,
        priority: def.priority,
        eligibilityRules: def.eligibilityRules as Prisma.InputJsonValue,
        suppressionRules: def.suppressionRules as Prisma.InputJsonValue,
      },
    });
  }
  return prisma.actionCatalog.findMany();
}

export class RecommendationService {
  constructor(
    private readonly repo = new RecommendationsRepository(),
    private readonly runRepo = new RecommendationRunRepository(),
  ) {}

  async run(options: { actor?: string } = {}): Promise<RecommendationRunSummary> {
    const startedAt = Date.now();
    const now = new Date();

    await ensureSegmentRules();
    const actions = await ensureActionCatalog();
    const actionById = new Map(actions.map((a) => [a.id, a]));
    const segmentIdBySlug = new Map((await this.repo.segments()).map((s) => [s.slug, s.id]));

    const run = await this.runRepo.start(runCode('REC', now), now);

    try {
      const memberships = await this.repo.activeMembershipContext();
      if (!memberships.length) {
        throw new Error('No active segment memberships found - run segmentation first');
      }

      // One active membership per customer; a duplicated injected row must not
      // create two recommendations for the same person.
      const membershipByCustomer = new Map<number, (typeof memberships)[number]>();
      for (const membership of memberships.sort((a, b) => a.segmentId - b.segmentId)) {
        if (!membershipByCustomer.has(membership.customerId)) membershipByCustomer.set(membership.customerId, membership);
      }

      const customerIds = [...membershipByCustomer.keys()];
      const customers = await this.repo.customersByIds(customerIds);
      const customerById = new Map(customers.map((c) => [c.id, c]));
      const consents = await this.repo.currentMarketingConsents(customerIds);
      const support = await this.repo.supportStatusByCustomer();
      const supportById = new Map(support.map((s) => [Number(s.customerId), s]));
      const lastContact = await this.repo.lastMarketingContact();
      const lastContactById = new Map(lastContact.map((c) => [Number(c.customerId), new Date(c.last_contact)]));

      // Consent must be evaluated per channel: an EMAIL withdrawal does not
      // revoke PUSH consent, and a PUSH grant must never authorise EMAIL.
      const consentByCustomer = new Map<number, Record<string, { granted: boolean; withdrawnAt: Date | null }>>();
      for (const consent of consents) {
        const perCustomer = consentByCustomer.get(consent.customerId) ?? {};
        const current = perCustomer[consent.channel] ?? { granted: false, withdrawnAt: null };
        if (consent.status === 'GRANTED') current.granted = true;
        if (consent.status === 'WITHDRAWN' && !current.granted && !current.withdrawnAt) {
          current.withdrawnAt = consent.withdrawnAt ?? consent.effectiveFrom;
        }
        perCustomer[consent.channel] = current;
        consentByCustomer.set(consent.customerId, perCustomer);
      }

      let sequence = await this.repo.nextRecommendationSequence();
      const decisions = new Map<number, ReturnType<typeof evaluateRecommendation>>();
      const rows: Prisma.RecommendationCreateManyInput[] = [];

      for (const customerId of customerIds) {
        const membership = membershipByCustomer.get(customerId)!;
        const customer = customerById.get(customerId);
        if (!customer) continue;
        const decisionInputs = (membership.decisionInputs ?? {}) as Record<string, number>;
        const consentState = consentByCustomer.get(customerId) ?? {};
        const supportState = supportById.get(customerId);

        const ctx: RecommendationContext = {
          customerId,
          customerCode: customer.customerCode,
          customerName: `${customer.firstName} ${customer.lastName}`,
          tenureDays: Number(decisionInputs.tenureDays ?? 0),
          recencyDays: membership.recencyDays,
          frequency: membership.frequency,
          monetaryPaise: Math.round(Number(membership.monetary) * 100),
          rScore: membership.rScore,
          fScore: membership.fScore,
          mScore: membership.mScore,
          segmentSlug: membership.segment.slug as never,
          serviceCostPaise: Math.round(Number(membership.serviceCost) * 100),
          openCases: Number(supportState?.open_cases ?? 0),
          escalatedCases: Number(supportState?.escalated_cases ?? 0),
          marketingConsent: consentState,
          lastMarketingContactAt: lastContactById.get(customerId) ?? null,
          hasEmail: Boolean(customer.email),
          hasPhone: Boolean(customer.phone),
        };

        const decision = evaluateRecommendation(ctx);
        decisions.set(customerId, decision);

        const actionRow = actions.find((a) => a.slug === decision.action.slug);
        if (!actionRow) throw new Error(`Action ${decision.action.slug} missing after seeding`);

        rows.push({
          recommendationCode: recommendationCode(sequence++),
          customerId,
          segmentId: segmentIdBySlug.get(membership.segment.slug) ?? membership.segmentId,
          actionId: actionRow.id,
          runId: run.runCode,
          recommendedAt: now,
          eligibility: decision.eligibility,
          suppressionResult: decision.suppression,
          status: decision.eligibility === 'SUPPRESSED' ? 'SUPPRESSED' : 'PENDING',
          score: new Prisma.Decimal(decision.score),
          explanation: decision.explanation,
          inputMetrics: decision.inputMetrics as Prisma.InputJsonValue,
          ruleVersion: 'nba-v1.0.0',
          sourcePipeline: 'recommendation-engine-v1',
        });
      }

      const created = await this.repo.insertMany(rows);
      const persisted = await this.repo.idsForRun(run.runCode);
      const idByCustomer = new Map(persisted.map((p) => [p.customerId, p.id]));

      const reasonRows: Prisma.RecommendationReasonCreateManyInput[] = [];
      for (const [customerId, decision] of decisions) {
        const recommendationId = idByCustomer.get(customerId);
        if (!recommendationId) continue;
        for (const reason of decision.reasons) {
          reasonRows.push({
            recommendationId,
            reasonCode: reason.reasonCode,
            label: reason.label,
            detail: reason.detail,
            metricName: reason.metricName ?? null,
            metricValue: reason.metricValue !== undefined ? new Prisma.Decimal(reason.metricValue) : null,
            thresholdValue: reason.thresholdValue !== undefined ? new Prisma.Decimal(reason.thresholdValue) : null,
            weight: new Prisma.Decimal(reason.weight),
          });
        }
      }
      await this.repo.insertReasons(reasonRows);

      const eligible = rows.filter((r) => r.eligibility === 'ELIGIBLE').length;
      const suppressed = rows.filter((r) => r.eligibility === 'SUPPRESSED').length;
      const noAction = rows.filter((r) => r.eligibility === 'NO_ACTION').length;
      const consentSuppressed = rows.filter((r) => r.suppressionResult === 'SUPPRESSED_CONSENT').length;

      await this.runRepo.complete(run.id, {
        processed: created,
        eligibleCount: eligible,
        suppressedCount: suppressed,
        noActionCount: noAction,
      });

      await auditService.record({
        actor: options.actor ?? 'system',
        action: 'RECOMMENDATION_RUN',
        entityType: 'RecommendationRun',
        entityId: run.runCode,
        payload: { processed: created, eligible, suppressed, noAction, consentSuppressed },
      });

      const byAction = Object.entries(
        rows.reduce<Record<string, number>>((acc, row) => {
          const slug = actionById.get(row.actionId as number)?.slug ?? 'unknown';
          acc[slug] = (acc[slug] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count);

      logger.info('recommendations completed', { run: run.runCode, created, eligible, suppressed, noAction });

      return {
        runCode: run.runCode,
        processed: created,
        eligible,
        suppressed,
        noAction,
        consentSuppressed,
        durationMs: Date.now() - startedAt,
        byAction,
      };
    } catch (error) {
      await this.runRepo.fail(run.id);
      throw error;
    }
  }

  async list(filters: RecommendationFilters, skip: number, take: number) {
    return this.repo.findMany(filters, skip, take);
  }

  async detail(id: number) {
    return this.repo.findById(id);
  }

  async actions() {
    return ensureActionCatalog();
  }

  async runs(limit = 10) {
    return this.runRepo.recent(limit);
  }

  async summary() {
    const grouped = await prisma.recommendation.groupBy({
      by: ['eligibility', 'suppressionResult'],
      _count: { _all: true },
    });
    return grouped.map((g) => ({ eligibility: g.eligibility, suppression: g.suppressionResult, count: g._count._all }));
  }
}

export const recommendationService = new RecommendationService();

