import { describe, expect, it } from 'vitest';
import { assignSegment, quintileScores, scorePopulation, RfmInput, NO_PURCHASE_RECENCY } from '../src/modules/segmentation/rfm';

const base: Omit<RfmInput, 'customerId' | 'customerCode'> = {
  tenureDays: 400,
  recencyDays: 10,
  frequency: 8,
  monetaryPaise: 500_000,
  serviceCostPaise: 0,
  openCases: 0,
};

describe('quintile scoring', () => {
  it('gives the best score to the most recent customer when lower is better', () => {
    const scores = quintileScores([0, 10, 20, 30, 40], false);
    expect(scores[0]).toBe(5);
    expect(scores[4]).toBe(1);
  });

  it('gives the best score to the highest value when higher is better', () => {
    const scores = quintileScores([1, 2, 3, 4, 5], true);
    expect(scores[4]).toBe(5);
    expect(scores[0]).toBe(1);
  });

  it('assigns identical scores to tied values (rank-min semantics)', () => {
    // 4 values, rank-min: the single worst value has better = 3 -> pct 0.75
    // -> score 5 - floor(3.75) = 2. This matches the Python ground-truth
    // implementation, which is the point of the tie test.
    const scores = quintileScores([5, 5, 5, 9], false);
    expect(scores[0]).toBe(scores[1]);
    expect(scores[1]).toBe(scores[2]);
    expect(scores[0]).toBe(5);
    expect(scores[3]).toBe(2);
  });

  it('is deterministic for the same input', () => {
    const input = [12, 4, 99, 4, 55];
    expect(quintileScores(input, false)).toEqual(quintileScores(input, false));
  });
});

describe('segment assignment rules (rfm-v1.0.0)', () => {
  it('classifies champions when all three scores are high', () => {
    expect(assignSegment({ rScore: 5, fScore: 5, mScore: 5, frequency: 10, tenureDays: 500, serviceCostPaise: 0, openCases: 0 }).slug).toBe(
      'champions',
    );
  });

  it('classifies cannot-lose-them when value is high but recency is poor', () => {
    expect(assignSegment({ rScore: 1, fScore: 5, mScore: 5, frequency: 12, tenureDays: 800, serviceCostPaise: 0, openCases: 0 }).slug).toBe(
      'cannot-lose-them',
    );
  });

  it('classifies new customers by tenure and low frequency', () => {
    expect(assignSegment({ rScore: 5, fScore: 3, mScore: 2, frequency: 2, tenureDays: 45, serviceCostPaise: 0, openCases: 0 }).slug).toBe(
      'new-customers',
    );
  });

  it('classifies at-risk customers with poor recency and decent frequency', () => {
    expect(assignSegment({ rScore: 2, fScore: 4, mScore: 2, frequency: 5, tenureDays: 600, serviceCostPaise: 0, openCases: 0 }).slug).toBe(
      'at-risk-customers',
    );
  });

  it('lets the service segment override value rules', () => {
    expect(
      assignSegment({ rScore: 5, fScore: 5, mScore: 5, frequency: 20, tenureDays: 900, serviceCostPaise: 200_000, openCases: 2 }).slug,
    ).toBe('high-service-cost');
  });

  it('falls back to lost customers', () => {
    expect(assignSegment({ rScore: 1, fScore: 1, mScore: 1, frequency: 1, tenureDays: 700, serviceCostPaise: 0, openCases: 0 }).slug).toBe(
      'lost-customers',
    );
  });
});

describe('population scoring', () => {
  it('produces a single segment for every customer and a valid RFM code', () => {
    const population: RfmInput[] = Array.from({ length: 50 }, (_, index) => ({
      ...base,
      customerId: index + 1,
      customerCode: `CUS-${String(index + 1).padStart(6, '0')}`,
      recencyDays: index === 0 ? NO_PURCHASE_RECENCY : index,
      frequency: index % 9,
      monetaryPaise: (index + 1) * 10_000,
    }));

    const results = scorePopulation(population);
    expect(results).toHaveLength(50);
    for (const result of results) {
      expect(result.segmentSlug).toBeTruthy();
      expect(result.rfmScore).toBe(result.rScore * 100 + result.fScore * 10 + result.mScore);
      expect(result.rScore).toBeGreaterThanOrEqual(1);
      expect(result.rScore).toBeLessThanOrEqual(5);
      expect(result.assignmentReason.length).toBeGreaterThan(20);
    }

    const segments = new Set(results.map((r) => r.segmentSlug));
    expect(segments.size).toBeGreaterThan(1);
  });
});
