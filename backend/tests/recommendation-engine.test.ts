import { describe, expect, it } from 'vitest';
import {
  evaluateRecommendation,
  RecommendationContext,
  selectAction,
} from '../src/modules/recommendations/recommendation-engine';

const context = (overrides: Partial<RecommendationContext> = {}): RecommendationContext => ({
  customerId: 1,
  customerCode: 'CUS-000001',
  customerName: 'Test Customer',
  tenureDays: 400,
  recencyDays: 12,
  frequency: 9,
  monetaryPaise: 4_500_000,
  rScore: 5,
  fScore: 5,
  mScore: 5,
  segmentSlug: 'champions',
  serviceCostPaise: 0,
  openCases: 0,
  escalatedCases: 0,
  marketingConsent: { EMAIL: { granted: true, withdrawnAt: null } },
  lastMarketingContactAt: null,
  hasEmail: true,
  hasPhone: true,
  ...overrides,
});

describe('action selection', () => {
  it('maps each segment to its playbook action', () => {
    expect(selectAction(context({ segmentSlug: 'champions' })).slug).toBe('loyalty-reward');
    expect(selectAction(context({ segmentSlug: 'new-customers' })).slug).toBe('welcome-onboarding');
    expect(selectAction(context({ segmentSlug: 'at-risk-customers' })).slug).toBe('re-engagement-campaign');
    expect(selectAction(context({ segmentSlug: 'cannot-lose-them' })).slug).toBe('retention-intervention');
    expect(selectAction(context({ segmentSlug: 'high-service-cost' })).slug).toBe('support-follow-up');
    expect(selectAction(context({ segmentSlug: 'lost-customers' })).slug).toBe('no-action');
  });

  it('escalates any segment with an escalated support case to service follow-up', () => {
    expect(selectAction(context({ segmentSlug: 'at-risk-customers', escalatedCases: 2 })).slug).toBe('support-follow-up');
  });
});

describe('consent enforcement', () => {
  it('suppresses a promotional action when marketing consent is withdrawn', () => {
    const decision = evaluateRecommendation(
      context({
        marketingConsent: { EMAIL: { granted: false, withdrawnAt: new Date('2026-01-15') } },
      }),
    );
    expect(decision.eligibility).toBe('SUPPRESSED');
    expect(decision.suppression).toBe('SUPPRESSED_CONSENT');
    expect(decision.explanation).toMatch(/suppressed/i);
    expect(decision.reasons[0].reasonCode).toBe('CONSENT_WITHDRAWN');
  });

  it('suppresses when there is no consent record at all', () => {
    const decision = evaluateRecommendation(context({ marketingConsent: {} }));
    expect(decision.eligibility).toBe('SUPPRESSED');
    expect(decision.suppression).toBe('SUPPRESSED_CONSENT');
  });

  it('evaluates consent per channel and never lets PUSH consent authorise EMAIL', () => {
    const decision = evaluateRecommendation(
      context({ marketingConsent: { PUSH: { granted: true, withdrawnAt: null } } }),
    );
    expect(decision.eligibility).toBe('SUPPRESSED');
    expect(decision.suppression).toBe('SUPPRESSED_CONSENT');
  });

  it('allows a non-promotional service action without marketing consent', () => {
    const decision = evaluateRecommendation(
      context({
        segmentSlug: 'high-service-cost',
        serviceCostPaise: 250_000,
        openCases: 2,
        marketingConsent: { EMAIL: { granted: false, withdrawnAt: new Date() } },
      }),
    );
    expect(decision.action.slug).toBe('support-follow-up');
    expect(decision.eligibility).toBe('ELIGIBLE');
  });
});

describe('suppression rules', () => {
  it('reroutes a customer with an escalated complaint to service recovery instead of marketing', () => {
    // Documented precedence: an escalated complaint wins over every marketing
    // playbook entry, so the engine never even evaluates a promotional action
    // for this customer. The observable guarantee is "no promotional contact".
    const decision = evaluateRecommendation(context({ escalatedCases: 1, segmentSlug: 'loyal-customers' }));
    expect(decision.action.slug).toBe('support-follow-up');
    expect(decision.action.isPromotional).toBe(false);
    expect(decision.suppression).toBe('NOT_SUPPRESSED');
    expect(decision.eligibility).toBe('ELIGIBLE');
  });

  it('never marks a promotional action eligible for a customer with an escalated complaint', () => {
    const decision = evaluateRecommendation(
      context({
        escalatedCases: 2,
        segmentSlug: 'champions',
        marketingConsent: { EMAIL: { granted: true, withdrawnAt: null } },
      }),
    );
    expect(decision.action.isPromotional).toBe(false);
    expect(decision.action.slug).toBe('support-follow-up');
  });

  it('suppresses promotional contact when an open support case exists', () => {
    const decision = evaluateRecommendation(context({ openCases: 1, escalatedCases: 0, segmentSlug: 'loyal-customers' }));
    expect(decision.suppression).toBe('SUPPRESSED_OPEN_SUPPORT_CASE');
  });

  it('returns a no-action decision for lost customers instead of inventing an offer', () => {
    const decision = evaluateRecommendation(
      context({ segmentSlug: 'lost-customers', rScore: 1, fScore: 1, mScore: 1, frequency: 1, recencyDays: 500 }),
    );
    expect(decision.action.slug).toBe('no-action');
    expect(decision.eligibility).toBe('NO_ACTION');
    expect(decision.reasons[0].reasonCode).toBe('NO_ACTION_JUSTIFIED');
  });

  it('marks a champion with consent eligible and records at least four reasons', () => {
    const decision = evaluateRecommendation(context());
    expect(decision.eligibility).toBe('ELIGIBLE');
    expect(decision.reasons.length).toBeGreaterThanOrEqual(4);
    expect(decision.explanation).toContain('Loyalty Reward');
    expect(decision.inputMetrics.marketingConsentGranted).toBe(true);
  });
});
