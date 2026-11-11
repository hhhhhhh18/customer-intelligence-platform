/**
 * Segment rule catalogue.  This is the single source of truth that is seeded
 * into `segment_rules` and evaluated by the segmentation engine.
 *
 * Rule version rfm-v1.0.0
 * ------------------------------------------------------------------
 * Scores are population quintiles (1 = worst, 5 = best):
 *   rScore: lower recency is better
 *   fScore / mScore: higher is better
 * Assignment is single-valued: the first matching rule wins, evaluated in
 * ascending `priority`.  All rules are exclusive; a customer must hold exactly
 * one active exclusive membership, which is why a second active membership is
 * a conflict rather than a legitimate overlap.
 */

export const RFM_RULE_VERSION = 'rfm-v1.0.0';

export type SegmentSlug =
  | 'high-service-cost'
  | 'champions'
  | 'cannot-lose-them'
  | 'new-customers'
  | 'potential-loyalists'
  | 'loyal-customers'
  | 'at-risk-customers'
  | 'hibernating-customers'
  | 'lost-customers';

export interface SegmentDefinition {
  slug: SegmentSlug;
  name: string;
  category: 'SERVICE' | 'VALUE' | 'LIFECYCLE' | 'RISK';
  priority: number;
  isExclusive: boolean;
  description: string;
  explanation: string;
  criteria: Record<string, unknown>;
}

export const SEGMENT_DEFINITIONS: SegmentDefinition[] = [
  {
    slug: 'high-service-cost',
    name: 'High-Service-Cost Customers',
    category: 'SERVICE',
    priority: 10,
    isExclusive: true,
    description:
      'Customers whose cost to serve is high and who still have an open or escalated support case. Service recovery takes precedence over any marketing treatment.',
    explanation:
      'serviceCost >= INR 1,500 and at least one support case in OPEN, IN_PROGRESS or ESCALATED status.',
    criteria: {
      all: [
        { field: 'serviceCost', op: '>=', value: 1500 },
        { field: 'openCases', op: '>=', value: 1 },
      ],
    },
  },
  {
    slug: 'champions',
    name: 'Champions',
    category: 'VALUE',
    priority: 20,
    isExclusive: true,
    description: 'Recent, frequent, high-spending customers. The most valuable group in the base.',
    explanation: 'rScore >= 4 and fScore >= 4 and mScore >= 4.',
    criteria: {
      all: [
        { field: 'rScore', op: '>=', value: 4 },
        { field: 'fScore', op: '>=', value: 4 },
        { field: 'mScore', op: '>=', value: 4 },
      ],
    },
  },
  {
    slug: 'cannot-lose-them',
    name: 'Cannot Lose Them',
    category: 'RISK',
    priority: 30,
    isExclusive: true,
    description: 'Historically very valuable customers who have stopped purchasing recently.',
    explanation: 'rScore <= 2 and fScore >= 4 and mScore >= 4.',
    criteria: {
      all: [
        { field: 'rScore', op: '<=', value: 2 },
        { field: 'fScore', op: '>=', value: 4 },
        { field: 'mScore', op: '>=', value: 4 },
      ],
    },
  },
  {
    slug: 'new-customers',
    name: 'New Customers',
    category: 'LIFECYCLE',
    priority: 40,
    isExclusive: true,
    description: 'Recently acquired customers who have not yet established a repeat purchase pattern.',
    explanation: 'tenureDays <= 90 and frequency <= 2 completed orders.',
    criteria: {
      all: [
        { field: 'tenureDays', op: '<=', value: 90 },
        { field: 'frequency', op: '<=', value: 2 },
      ],
    },
  },
  {
    slug: 'potential-loyalists',
    name: 'Potential Loyalists',
    category: 'LIFECYCLE',
    priority: 50,
    isExclusive: true,
    description: 'Recent customers with a small but growing purchase history.',
    explanation: 'rScore >= 4 and frequency between 2 and 4 completed orders.',
    criteria: {
      all: [
        { field: 'rScore', op: '>=', value: 4 },
        { field: 'frequency', op: 'between', value: [2, 4] },
      ],
    },
  },
  {
    slug: 'loyal-customers',
    name: 'Loyal Customers',
    category: 'VALUE',
    priority: 60,
    isExclusive: true,
    description: 'Consistent repeat buyers who purchase recently and often.',
    explanation: 'rScore >= 3 and fScore >= 3.',
    criteria: {
      all: [
        { field: 'rScore', op: '>=', value: 3 },
        { field: 'fScore', op: '>=', value: 3 },
      ],
    },
  },
  {
    slug: 'at-risk-customers',
    name: 'At-Risk Customers',
    category: 'RISK',
    priority: 70,
    isExclusive: true,
    description: 'Previously frequent buyers whose last purchase is getting old.',
    explanation: 'rScore <= 2 and fScore >= 3.',
    criteria: {
      all: [
        { field: 'rScore', op: '<=', value: 2 },
        { field: 'fScore', op: '>=', value: 3 },
      ],
    },
  },
  {
    slug: 'hibernating-customers',
    name: 'Hibernating Customers',
    category: 'RISK',
    priority: 80,
    isExclusive: true,
    description: 'Low-frequency customers with mid-range recency who have not fully lapsed.',
    explanation: 'rScore = 2 and fScore <= 2.',
    criteria: {
      all: [
        { field: 'rScore', op: '=', value: 2 },
        { field: 'fScore', op: '<=', value: 2 },
      ],
    },
  },
  {
    slug: 'lost-customers',
    name: 'Lost Customers',
    category: 'RISK',
    priority: 90,
    isExclusive: true,
    description: 'Long-dormant, low-value customers. Expensive to reactivate; rarely worth a full campaign.',
    explanation: 'Fallback rule: every customer not matched above.',
    criteria: { all: [] },
  },
];

export const SEGMENT_BY_SLUG = new Map(SEGMENT_DEFINITIONS.map((s) => [s.slug, s]));
