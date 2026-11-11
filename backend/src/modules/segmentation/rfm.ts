/**
 * Pure RFM scoring and segment assignment.
 *
 * Deliberately free of database access so the business rules can be unit
 * tested and cross-validated against the Python ground-truth implementation.
 *
 * Scoring is population quintile based, using rank(method="min") semantics:
 *   better = count of customers strictly better on the metric
 *   pct    = better / n
 *   score  = 5 - min(4, floor(pct * 5))
 * Ties therefore receive identical scores, and the mapping is deterministic
 * for a fixed population.
 */
import { RFM_RULE_VERSION, SEGMENT_DEFINITIONS, SegmentSlug } from './segment-definitions';

export interface RfmInput {
  customerId: number;
  customerCode: string;
  tenureDays: number;
  recencyDays: number;
  frequency: number;
  monetaryPaise: number;
  serviceCostPaise: number;
  openCases: number;
}

export interface RfmResult extends RfmInput {
  rScore: number;
  fScore: number;
  mScore: number;
  rfmScore: number;
  segmentSlug: SegmentSlug;
  assignmentReason: string;
  ruleVersion: string;
}

/** Missing purchase history is treated as maximally stale. */
export const NO_PURCHASE_RECENCY = 9999;

export function quintileScores(values: number[], higherIsBetter: boolean): number[] {
  const n = values.length;
  if (n === 0) return [];

  const sorted = [...values].sort((a, b) => (higherIsBetter ? b - a : a - b));
  const firstIndex = new Map<number, number>();
  sorted.forEach((value, index) => {
    if (!firstIndex.has(value)) firstIndex.set(value, index);
  });

  return values.map((value) => {
    const better = firstIndex.get(value) ?? 0;
    const pct = better / n;
    return 5 - Math.min(4, Math.floor(pct * 5));
  });
}

export function assignSegment(input: {
  rScore: number;
  fScore: number;
  mScore: number;
  frequency: number;
  tenureDays: number;
  serviceCostPaise: number;
  openCases: number;
}): { slug: SegmentSlug; matchedRule: string } {
  const { rScore: r, fScore: f, mScore: m, frequency, tenureDays, serviceCostPaise, openCases } = input;

  if (serviceCostPaise >= 150_000 && openCases >= 1) {
    return { slug: 'high-service-cost', matchedRule: 'service-cost-and-open-case' };
  }
  if (r >= 4 && f >= 4 && m >= 4) return { slug: 'champions', matchedRule: 'r4-f4-m4' };
  if (r <= 2 && f >= 4 && m >= 4) return { slug: 'cannot-lose-them', matchedRule: 'r-low-f-high-m-high' };
  if (tenureDays <= 90 && frequency <= 2) return { slug: 'new-customers', matchedRule: 'tenure-90-freq-2' };
  if (r >= 4 && frequency >= 2 && frequency <= 4) {
    return { slug: 'potential-loyalists', matchedRule: 'r-high-freq-2-4' };
  }
  if (r >= 3 && f >= 3) return { slug: 'loyal-customers', matchedRule: 'r3-f3' };
  if (r <= 2 && f >= 3) return { slug: 'at-risk-customers', matchedRule: 'r-low-f3' };
  if (r === 2 && f <= 2) return { slug: 'hibernating-customers', matchedRule: 'r2-f-low' };
  return { slug: 'lost-customers', matchedRule: 'fallback' };
}

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(paise / 100));

export function explainAssignment(result: Omit<RfmResult, 'assignmentReason'>): string {
  const definition = SEGMENT_DEFINITIONS.find((s) => s.slug === result.segmentSlug);
  const ruleName = definition?.name ?? result.segmentSlug;
  const parts = [
    `Assigned to ${ruleName} because recency is ${result.recencyDays} days (R=${result.rScore}), ` +
      `completed purchases are ${result.frequency} (F=${result.fScore}) and net spend is INR ${inr(result.monetaryPaise)} (M=${result.mScore}).`,
  ];
  if (result.segmentSlug === 'high-service-cost') {
    parts.push(
      `Support handling cost is INR ${inr(result.serviceCostPaise)} with ${result.openCases} unresolved case(s), which overrides the value-based rules.`,
    );
  } else {
    parts.push(`Rule applied: ${definition?.explanation ?? ''}`);
  }
  parts.push(`Tenure is ${result.tenureDays} days. Rule version ${RFM_RULE_VERSION}.`);
  return parts.join(' ');
}

/**
 * Scores the whole population at once: quintiles are relative, so a customer
 * cannot be scored in isolation.
 */
export function scorePopulation(inputs: RfmInput[]): RfmResult[] {
  const recencies = inputs.map((i) => i.recencyDays);
  const frequencies = inputs.map((i) => i.frequency);
  const monetaries = inputs.map((i) => i.monetaryPaise);

  const rScores = quintileScores(recencies, false);
  const fScores = quintileScores(frequencies, true);
  const mScores = quintileScores(monetaries, true);

  return inputs.map((input, index) => {
    const rScore = rScores[index];
    const fScore = fScores[index];
    const mScore = mScores[index];
    const { slug } = assignSegment({ ...input, rScore, fScore, mScore });
    const base = {
      ...input,
      rScore,
      fScore,
      mScore,
      rfmScore: rScore * 100 + fScore * 10 + mScore,
      segmentSlug: slug,
      ruleVersion: RFM_RULE_VERSION,
    };
    return { ...base, assignmentReason: explainAssignment(base) };
  });
}
