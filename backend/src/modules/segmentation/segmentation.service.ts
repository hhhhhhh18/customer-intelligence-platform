import { prisma, Prisma } from '../../db/prisma';
import { auditService } from '../audit/audit.service';
import { logger } from '../../utils/logger';
import { membershipCode, runCode, segmentCode } from '../../utils/ids';
import { RFM_RULE_VERSION, SEGMENT_DEFINITIONS } from './segment-definitions';
import { scorePopulation } from './rfm';
import { SegmentationRepository, SegmentationRunRepository, toRfmInput } from './segmentation.repository';

export interface SegmentationRunSummary {
  runCode: string;
  asOfDate: string;
  ruleVersion: string;
  customersScored: number;
  membershipsCreated: number;
  membershipsSuperseded: number;
  unchanged: number;
  unassigned: number;
  conflictsDetected: number;
  durationMs: number;
  segmentCounts: Array<{ slug: string; name: string; count: number }>;
}

/**
 * Seeds the segment rule catalogue.  Idempotent: existing rules keep their
 * identifiers so memberships never point at a missing segment.
 */
export async function ensureSegmentRules() {
  const existing = await prisma.segmentRule.findMany();
  const bySlug = new Map(existing.map((r) => [r.slug, r]));
  const result = new Map<string, { id: number; code: string; name: string; priority: number }>();

  for (let index = 0; index < SEGMENT_DEFINITIONS.length; index += 1) {
    const def = SEGMENT_DEFINITIONS[index];
    const found = bySlug.get(def.slug);
    if (found) {
      result.set(def.slug, { id: found.id, code: found.segmentCode, name: found.name, priority: found.priority });
      continue;
    }
    const created = await prisma.segmentRule.create({
      data: {
        segmentCode: segmentCode(index + 1),
        slug: def.slug,
        name: def.name,
        description: def.description,
        category: def.category,
        priority: def.priority,
        isExclusive: def.isExclusive,
        ruleVersion: RFM_RULE_VERSION,
        criteria: def.criteria as Prisma.InputJsonValue,
        explanation: def.explanation,
      },
    });
    result.set(def.slug, {
      id: created.id,
      code: created.segmentCode,
      name: created.name,
      priority: created.priority,
    });
  }
  return result;
}

export class SegmentationService {
  constructor(
    private readonly repo = new SegmentationRepository(),
    private readonly runRepo = new SegmentationRunRepository(),
  ) {}

  async run(options: { asOfDate?: Date; actor?: string } = {}): Promise<SegmentationRunSummary> {
    const startedAt = Date.now();
    const now = new Date();
    const segments = await ensureSegmentRules();
    const asOf = options.asOfDate ?? (await this.repo.getLatestReferenceDate()) ?? this.today();
    const run = await this.runRepo.start(runCode('SEG', now), RFM_RULE_VERSION, asOf);

    try {
      const rows = await this.repo.loadMetrics();
      if (!rows.length) throw new Error('No customers found - load a dataset before running segmentation');

      const scored = scorePopulation(rows.map((row) => toRfmInput(row, asOf)));
      const active = await this.repo.activeMemberships();

      // A customer may legitimately have several historical rows; only the
      // ACTIVE ones matter here.  If an injected legacy row created a second
      // active membership, we keep the earliest and let the conflict detector
      // report the duplicate instead of silently deleting it.
      const activeByCustomer = new Map<number, typeof active[number]>();
      for (const membership of active.sort((a, b) => a.id - b.id)) {
        if (!activeByCustomer.has(membership.customerId)) activeByCustomer.set(membership.customerId, membership);
      }

      const usedCodes = new Set(
        (await prisma.segmentMembership.findMany({ select: { membershipCode: true } })).map((m) => m.membershipCode),
      );

      const toCreate: Prisma.SegmentMembershipCreateManyInput[] = [];
      const toClose: number[] = [];
      let unchanged = 0;

      for (const customer of scored) {
        const target = segments.get(customer.segmentSlug);
        if (!target) throw new Error(`Unknown segment slug ${customer.segmentSlug}`);
        const current = activeByCustomer.get(customer.customerId);

        if (current && current.segmentId === target.id) {
          unchanged += 1;
          continue;
        }
        if (current) toClose.push(current.id);

        let code = membershipCode(target.code, customer.customerCode);
        let revision = 2;
        while (usedCodes.has(code)) {
          code = `${membershipCode(target.code, customer.customerCode)}-R${revision}`;
          revision += 1;
        }
        usedCodes.add(code);

        toCreate.push({
          membershipCode: code,
          segmentId: target.id,
          customerId: customer.customerId,
          assignedAt: now,
          effectiveFrom: now,
          status: 'ACTIVE',
          ruleVersion: customer.ruleVersion,
          recencyDays: customer.recencyDays,
          frequency: customer.frequency,
          monetary: new Prisma.Decimal(customer.monetaryPaise).div(100),
          rScore: customer.rScore,
          fScore: customer.fScore,
          mScore: customer.mScore,
          rfmScore: customer.rfmScore,
          serviceCost: new Prisma.Decimal(customer.serviceCostPaise).div(100),
          assignmentReason: customer.assignmentReason,
          decisionInputs: {
            recencyDays: customer.recencyDays,
            frequency: customer.frequency,
            monetary: Number((customer.monetaryPaise / 100).toFixed(2)),
            serviceCost: Number((customer.serviceCostPaise / 100).toFixed(2)),
            openCases: customer.openCases,
            tenureDays: customer.tenureDays,
            rScore: customer.rScore,
            fScore: customer.fScore,
            mScore: customer.mScore,
          } as Prisma.InputJsonValue,
        });
      }

      const superseded = await this.repo.closeMemberships(toClose, asOf);
      const created = await this.repo.createMemberships(toCreate);

      const counts = await this.repo.segmentCounts();
      const nameById = new Map([...segments.values()].map((s) => [s.id, s]));
      const segmentCounts = counts
        .map((row) => ({
          slug: [...segments.entries()].find(([, v]) => v.id === row.segmentId)?.[0] ?? 'unknown',
          name: nameById.get(row.segmentId)?.name ?? 'Unknown',
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count);

      const conflictRows = await this.detectConflictsInternal();
      const unassigned = Number((await this.repo.countUnassigned())[0]?.count ?? 0);

      await this.runRepo.complete(run.id, {
        customersScored: scored.length,
        membershipsCreated: created,
        conflictsDetected: conflictRows,
        unassignedCount: unassigned,
      });

      await auditService.record({
        actor: options.actor ?? 'system',
        action: 'SEGMENTATION_RUN',
        entityType: 'SegmentationRun',
        entityId: run.runCode,
        payload: {
          asOfDate: asOf.toISOString().slice(0, 10),
          ruleVersion: RFM_RULE_VERSION,
          scored: scored.length,
          created,
          superseded,
        },
      });

      logger.info('segmentation completed', { run: run.runCode, scored: scored.length, created, superseded });

      return {
        runCode: run.runCode,
        asOfDate: asOf.toISOString().slice(0, 10),
        ruleVersion: RFM_RULE_VERSION,
        customersScored: scored.length,
        membershipsCreated: created,
        membershipsSuperseded: superseded,
        unchanged,
        unassigned,
        conflictsDetected: conflictRows,
        durationMs: Date.now() - startedAt,
        segmentCounts,
      };
    } catch (error) {
      await this.runRepo.fail(run.id);
      throw error;
    }
  }

  /** Counts customers holding more than one active exclusive membership. */
  private async detectConflictsInternal(): Promise<number> {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT m."customerId"
        FROM segment_memberships m
        JOIN segment_rules s ON s.id = m."segmentId"
        WHERE m.status = 'ACTIVE' AND s."isExclusive" = true
        GROUP BY m."customerId"
        HAVING COUNT(*) > 1
      ) conflicts
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async listSegments() {
    const rules = await this.repo.listSegments();
    const counts = await this.repo.segmentCounts();
    const countBySegment = new Map(counts.map((c) => [c.segmentId, c._count._all]));
    const total = await prisma.customer.count();

    return rules.map((rule) => ({
      id: rule.id,
      segmentCode: rule.segmentCode,
      slug: rule.slug,
      name: rule.name,
      description: rule.description,
      category: rule.category,
      priority: rule.priority,
      isExclusive: rule.isExclusive,
      ruleVersion: rule.ruleVersion,
      criteria: rule.criteria,
      explanation: rule.explanation,
      customerCount: countBySegment.get(rule.id) ?? 0,
      shareOfBase: total ? Number((((countBySegment.get(rule.id) ?? 0) / total) * 100).toFixed(2)) : 0,
    }));
  }

  async membershipHistory(customerId: number) {
    return prisma.segmentMembership.findMany({
      where: { customerId },
      include: { segment: { select: { name: true, slug: true, segmentCode: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async conflicts() {
    const rows = await prisma.$queryRaw<
      Array<{ customerId: number; customerCode: string; segmentCount: bigint }>
    >`
      SELECT m."customerId" AS "customerId", c."customerCode" AS "customerCode", COUNT(*)::bigint AS "segmentCount"
      FROM segment_memberships m
      JOIN segment_rules s ON s.id = m."segmentId"
      JOIN customers c ON c.id = m."customerId"
      WHERE m.status = 'ACTIVE' AND s."isExclusive" = true
      GROUP BY m."customerId", c."customerCode"
      HAVING COUNT(*) > 1
      ORDER BY c."customerCode"
    `;
    if (!rows.length) return [];

    const customerIds = rows.map((r) => Number(r.customerId));
    const memberships = await prisma.segmentMembership.findMany({
      where: { customerId: { in: customerIds }, status: 'ACTIVE' },
      include: { segment: { select: { name: true, slug: true, segmentCode: true, isExclusive: true } } },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => ({
      customerId: Number(row.customerId),
      customerCode: row.customerCode,
      multipleActiveSegments: true,
      explanation:
        'Both memberships are marked ACTIVE on segments flagged exclusive. A customer may hold exactly one exclusive segment; the later row came from a legacy import and must be corrected by a human.',
      segments: memberships
        .filter((m) => m.customerId === Number(row.customerId))
        .map((m) => ({
          membershipCode: m.membershipCode,
          segmentCode: m.segment.segmentCode,
          name: m.segment.name,
          slug: m.segment.slug,
          ruleVersion: m.ruleVersion,
          assignedAt: m.assignedAt,
        })),
    }));
  }

  async runs(limit = 10) {
    return this.runRepo.recent(limit);
  }

  private today() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}

export const segmentationService = new SegmentationService();
