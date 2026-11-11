/**
 * Ground-truth evaluation.
 *
 * This module is the *only* place that reads data-engine/ground_truth.  It is
 * used for scoring and reporting and is never imported by the segmentation,
 * recommendation, consent or outcome engines.  Tests assert that boundary.
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../../db/prisma';

const GT_DIR = path.resolve(process.cwd(), '..', 'data-engine', 'ground_truth');

export interface GroundTruthSegment {
  customerCode: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  segmentSlug: string;
  rScore: number;
  fScore: number;
  mScore: number;
}

export interface GroundTruthAnomaly {
  anomalyId: string;
  category: string;
  customerCode?: string;
  customerId?: number;
  orderCode?: string;
  expectedNetTotal?: string;
}

export interface GroundTruthBundle {
  segments: GroundTruthSegment[];
  anomalies: GroundTruthAnomaly[];
  withdrawnCustomers: string[];
  seed: number;
  profile: string;
  referenceDate: string;
  distribution: Record<string, number>;
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const parseLine = (line: string) => {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current);
        current = '';
      } else current += char;
    }
    values.push(current);
    return values;
  };
  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']));
  });
}

export async function loadGroundTruth(): Promise<GroundTruthBundle | null> {
  const segmentsPath = path.join(GT_DIR, 'expected_segments.csv');
  const anomaliesPath = path.join(GT_DIR, 'ground_truth.json');
  if (!fs.existsSync(segmentsPath) || !fs.existsSync(anomaliesPath)) return null;

  const rows = parseCsv(fs.readFileSync(segmentsPath, 'utf8'));
  const meta = JSON.parse(fs.readFileSync(anomaliesPath, 'utf8')) as {
    seed: number;
    profile: string;
    referenceDate: string;
    anomalies: GroundTruthAnomaly[];
    segmentDistribution: Record<string, number>;
  };

  let withdrawnCustomers: string[] = [];
  const suppressionPath = path.join(GT_DIR, 'expected_suppression.json');
  if (fs.existsSync(suppressionPath)) {
    withdrawnCustomers = (
      JSON.parse(fs.readFileSync(suppressionPath, 'utf8')) as { emailMarketingWithdrawn: string[] }
    ).emailMarketingWithdrawn;
  }

  return {
    segments: rows.map((row) => ({
      customerCode: row.customerCode,
      recencyDays: Number(row.recencyDays),
      frequency: Number(row.frequency),
      monetary: Number(row.monetary),
      segmentSlug: row.segmentSlug,
      rScore: Number(row.rScore),
      fScore: Number(row.fScore),
      mScore: Number(row.mScore),
    })),
    anomalies: meta.anomalies,
    withdrawnCustomers,
    seed: Number(meta.seed),
    profile: String(meta.profile),
    referenceDate: String(meta.referenceDate),
    distribution: meta.segmentDistribution ?? {},
  };
}

export async function evaluateAgainstGroundTruth(gt: GroundTruthBundle) {
  const memberships = await prisma.$queryRaw<
    Array<{ customerCode: string; slug: string; monetary: string; recencyDays: number; frequency: number }>
  >`
    SELECT c."customerCode" AS "customerCode", s.slug AS slug, m.monetary::text AS monetary,
           m."recencyDays" AS "recencyDays", m.frequency
    FROM segment_memberships m
    JOIN segment_rules s ON s.id = m."segmentId"
    JOIN customers c ON c.id = m."customerId"
    WHERE m.status = 'ACTIVE'
    ORDER BY m.id ASC
  `;

  const byCustomer = new Map<string, (typeof memberships)[number]>();
  let duplicateActive = 0;
  for (const membership of memberships) {
    if (byCustomer.has(membership.customerCode)) duplicateActive += 1;
    else byCustomer.set(membership.customerCode, membership);
  }

  let matched = 0;
  let compared = 0;
  const mismatches: Array<Record<string, unknown>> = [];
  let netSpendMatches = 0;

  for (const expected of gt.segments) {
    const actual = byCustomer.get(expected.customerCode);
    if (!actual) continue;
    compared += 1;
    if (actual.slug === expected.segmentSlug) matched += 1;
    else if (mismatches.length < 20) {
      mismatches.push({
        customerCode: expected.customerCode,
        expected: expected.segmentSlug,
        actual: actual.slug,
        expectedRfm: `${expected.rScore}${expected.fScore}${expected.mScore}`,
        actualRfm: `${actual.recencyDays}d/${actual.frequency}`,
      });
    }
    if (Math.abs(Number(actual.monetary) - expected.monetary) < 0.01) netSpendMatches += 1;
  }

  const exceptions = await prisma.exceptionRecord.findMany({
    select: { category: true, entityId: true, customerId: true, exceptionCode: true },
  });

  const anomalyResults = gt.anomalies.map((anomaly) => {
    const candidates = exceptions.filter((e) => e.category === anomaly.category);
    let detected = false;
    let reference: string | null = null;

    if (anomaly.category === 'RETURN_NOT_NETTED' && anomaly.orderCode) {
      const match = candidates.find((e) => e.entityId === anomaly.orderCode);
      detected = Boolean(match);
      reference = match?.exceptionCode ?? null;
    } else if (anomaly.category === 'SEGMENT_CONFLICT' && anomaly.customerCode) {
      const match = candidates.find((e) => e.entityId === anomaly.customerCode);
      detected = Boolean(match);
      reference = match?.exceptionCode ?? null;
    } else if (anomaly.category === 'CONSENT_VIOLATION') {
      const match = anomaly.customerId
        ? candidates.find((e) => Number(e.customerId) === Number(anomaly.customerId))
        : candidates[0];
      detected = Boolean(match);
      reference = match?.exceptionCode ?? null;
    } else if (anomaly.category === 'OUTCOME_ATTRIBUTION') {
      detected = candidates.length > 0;
      reference = candidates[0]?.exceptionCode ?? null;
    }

    return {
      anomalyId: anomaly.anomalyId,
      category: anomaly.category,
      detected,
      exceptionCode: reference,
      evidenceCount: candidates.length,
      extraDetections: Math.max(candidates.length - 1, 0),
    };
  });

  const excluded = gt.withdrawnCustomers;
  const violating = excluded.length
    ? await prisma.recommendation.count({
        where: {
          eligibility: 'ELIGIBLE',
          customer: { customerCode: { in: excluded } },
          action: { requiresMarketingConsent: true },
        },
      })
    : 0;

  const detectedCount = anomalyResults.filter((a) => a.detected).length;

  return {
    segmentation: {
      compared,
      matched,
      accuracy: compared ? Number(((matched / compared) * 100).toFixed(2)) : 0,
      duplicateActiveMemberships: duplicateActive,
      mismatches,
      expectedDistribution: gt.distribution,
    },
    netSpend: {
      compared,
      matched: netSpendMatches,
      accuracy: compared ? Number(((netSpendMatches / compared) * 100).toFixed(2)) : 0,
    },
    anomalies: {
      labeled: gt.anomalies.length,
      detected: detectedCount,
      detectionRate: gt.anomalies.length ? Number(((detectedCount / gt.anomalies.length) * 100).toFixed(2)) : 0,
      results: anomalyResults,
    },
    consent: {
      customersWithWithdrawnMarketingConsent: excluded.length,
      eligiblePromotionalRecommendations: violating,
      prevented: violating === 0,
    },
    groundTruthSource: {
      seed: gt.seed,
      profile: gt.profile,
      referenceDate: gt.referenceDate,
      note: 'Labels are read only by this evaluation module and by tests; no engine consumes them.',
    },
  };
}
