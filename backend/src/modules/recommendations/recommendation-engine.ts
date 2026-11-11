/**
 * Pure next-best-action engine.
 *
 * Deterministic by construction: no randomness, no LLM, no clock reads inside
 * the decision.  Given the same inputs it produces the same action, the same
 * eligibility/suppression verdict and the same explanation, which is what makes
 * the recommendations auditable.
 *
 * Enforcement order matters: consent is evaluated before any action can become
 * ELIGIBLE for execution.
 */
import type { SegmentSlug } from '../segmentation/segment-definitions';
import { ACTION_BY_SLUG, ActionDefinition, ActionSlug } from './action-catalog';

export type Eligibility = 'ELIGIBLE' | 'SUPPRESSED' | 'NO_ACTION';
export type Suppression =
  | 'NOT_SUPPRESSED'
  | 'SUPPRESSED_CONSENT'
  | 'SUPPRESSED_CONTACT_PREFERENCE'
  | 'SUPPRESSED_OPEN_SUPPORT_CASE'
  | 'SUPPRESSED_RECENT_CONTACT'
  | 'SUPPRESSED_ACTIVE_COMPLAINT';

export interface RecommendationContext {
  customerId: number;
  customerCode: string;
  customerName: string;
  tenureDays: number;
  recencyDays: number;
  frequency: number;
  monetaryPaise: number;
  rScore: number;
  fScore: number;
  mScore: number;
  segmentSlug: SegmentSlug;
  serviceCostPaise: number;
  openCases: number;
  escalatedCases: number;
  /** Channel -> consent state. Promotional actions require a grant on their own channel. */
  marketingConsent: Record<string, { granted: boolean; withdrawnAt: Date | null }>;
  lastMarketingContactAt: Date | null;
  hasEmail: boolean;
  hasPhone: boolean;
}

export interface RecommendationReason {
  reasonCode: string;
  label: string;
  detail: string;
  metricName?: string;
  metricValue?: number;
  thresholdValue?: number;
  weight: number;
}

export interface RecommendationDecision {
  action: ActionDefinition;
  eligibility: Eligibility;
  suppression: Suppression;
  reasons: RecommendationReason[];
  explanation: string;
  inputMetrics: Record<string, unknown>;
  score: number;
}

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(paise / 100));

const SEGMENT_ACTION: Record<SegmentSlug, ActionSlug> = {
  'champions': 'loyalty-reward',
  'loyal-customers': 'product-recommendation',
  'potential-loyalists': 'product-recommendation',
  'new-customers': 'welcome-onboarding',
  'cannot-lose-them': 'retention-intervention',
  'at-risk-customers': 're-engagement-campaign',
  'hibernating-customers': 're-engagement-campaign',
  'high-service-cost': 'support-follow-up',
  'lost-customers': 'no-action',
};

/** Segment -> action, with two documented overrides. */
export function selectAction(ctx: RecommendationContext): { slug: ActionSlug; reason: string } {
  if (ctx.escalatedCases > 0 && ctx.segmentSlug !== 'high-service-cost') {
    return {
      slug: 'support-follow-up',
      reason: `Customer has ${ctx.escalatedCases} escalated support case(s), so service recovery takes precedence over any marketing treatment.`,
    };
  }
  if (ctx.segmentSlug === 'loyal-customers' && ctx.mScore >= 4 && ctx.frequency >= 6) {
    return {
      slug: 'loyalty-reward',
      reason: `Loyal customer with ${ctx.frequency} purchases and high net spend qualifies for a loyalty reward rather than a generic recommendation.`,
    };
  }
  return {
    slug: SEGMENT_ACTION[ctx.segmentSlug],
    reason: `Segment ${ctx.segmentSlug} maps to this action in the v1 playbook.`,
  };
}

const CONSENT_CHANNELS = new Set(['EMAIL', 'SMS', 'PUSH', 'DIRECT_MAIL']);

export function evaluateRecommendation(ctx: RecommendationContext, ruleVersion = 'nba-v1.0.0'): RecommendationDecision {
  const { slug, reason: selectionReason } = selectAction(ctx);
  const action = ACTION_BY_SLUG.get(slug);
  if (!action) throw new Error(`Action ${slug} is missing from the catalogue`);

  const reasons: RecommendationReason[] = [
    {
      reasonCode: 'SEGMENT_MATCH',
      label: `Segment: ${ctx.segmentSlug}`,
      detail: selectionReason,
      weight: 2,
    },
    {
      reasonCode: 'RECENCY',
      label: `${ctx.recencyDays} days since last purchase`,
      detail: `Recency score R=${ctx.rScore} places the customer in the ${ctx.rScore >= 4 ? 'most recent' : ctx.rScore <= 2 ? 'least recent' : 'middle'} quintile.`,
      metricName: 'recencyDays',
      metricValue: ctx.recencyDays,
      weight: 1,
    },
    {
      reasonCode: 'FREQUENCY',
      label: `${ctx.frequency} completed purchases`,
      detail: `Frequency score F=${ctx.fScore} from ${ctx.frequency} completed orders in the analysis window.`,
      metricName: 'frequency',
      metricValue: ctx.frequency,
      weight: 1,
    },
    {
      reasonCode: 'MONETARY',
      label: `INR ${inr(ctx.monetaryPaise)} net spend`,
      detail: `Monetary score M=${ctx.mScore}; net spend is calculated after returns and refunds.`,
      metricName: 'netSpend',
      metricValue: Number((ctx.monetaryPaise / 100).toFixed(2)),
      weight: 1,
    },
  ];

  let eligibility: Eligibility = 'ELIGIBLE';
  let suppression: Suppression = 'NOT_SUPPRESSED';

  const consentState = ctx.marketingConsent[action.channel] ?? { granted: false, withdrawnAt: null };

  // ---- 1. Consent gate (hard block, evaluated first) --------------------
  if (action.requiresMarketingConsent && !consentState.granted) {
    eligibility = 'SUPPRESSED';
    suppression = 'SUPPRESSED_CONSENT';
    reasons.unshift({
      reasonCode: 'CONSENT_WITHDRAWN',
      label: 'Marketing consent withdrawn',
      detail: consentState.withdrawnAt
        ? `Customer withdrew ${action.channel} marketing consent on ${consentState.withdrawnAt.toISOString().slice(0, 10)}. Promotional contact is blocked regardless of segment value.`
        : `No active GRANTED ${action.channel} marketing consent exists, so promotional contact is blocked regardless of segment value.`,
      metricName: 'marketingConsent',
      metricValue: 0,
      weight: 5,
    });
  } else if (action.requiresMarketingConsent && CONSENT_CHANNELS.has(action.channel) && !ctx.hasEmail && action.channel === 'EMAIL') {
    eligibility = 'SUPPRESSED';
    suppression = 'SUPPRESSED_CONTACT_PREFERENCE';
    reasons.unshift({
      reasonCode: 'NO_CONTACT_ADDRESS',
      label: 'No usable contact address',
      detail: 'The customer has no verified email address for this channel.',
      weight: 4,
    });
  } else if (action.isPromotional && ctx.escalatedCases > 0) {
    // ---- 2. Active complaint suppression -------------------------------
    eligibility = 'SUPPRESSED';
    suppression = 'SUPPRESSED_ACTIVE_COMPLAINT';
    reasons.unshift({
      reasonCode: 'ACTIVE_COMPLAINT',
      label: `${ctx.escalatedCases} escalated support case(s)`,
      detail: 'Marketing is paused while an escalated complaint is unresolved; the support follow-up action owns this customer.',
      metricName: 'escalatedCases',
      metricValue: ctx.escalatedCases,
      weight: 4,
    });
  } else if (action.isPromotional && ctx.openCases > 0) {
    eligibility = 'SUPPRESSED';
    suppression = 'SUPPRESSED_OPEN_SUPPORT_CASE';
    reasons.unshift({
      reasonCode: 'OPEN_SUPPORT_CASE',
      label: `${ctx.openCases} open support case(s)`,
      detail: 'Promotional contact is suppressed until the open support case is resolved.',
      metricName: 'openCases',
      metricValue: ctx.openCases,
      weight: 3,
    });
  } else if (ctx.lastMarketingContactAt && action.isPromotional) {
    // ---- 3. Contact frequency cap --------------------------------------
    const daysSince = Math.floor((Date.now() - ctx.lastMarketingContactAt.getTime()) / 86_400_000);
    const cap = Number(
      (action.suppressionRules as Record<string, unknown>)?.frequencyCapDays ?? 14,
    );
    if (daysSince < cap) {
      eligibility = 'SUPPRESSED';
      suppression = 'SUPPRESSED_RECENT_CONTACT';
      reasons.unshift({
        reasonCode: 'FREQUENCY_CAP',
        label: `Contacted ${daysSince} day(s) ago`,
        detail: `Action requires at least ${cap} days between contacts to the same customer.`,
        metricName: 'daysSinceContact',
        metricValue: daysSince,
        thresholdValue: cap,
        weight: 3,
      });
    }
  } else if (action.channel === 'PHONE' && !ctx.hasPhone) {
    eligibility = 'SUPPRESSED';
    suppression = 'SUPPRESSED_CONTACT_PREFERENCE';
    reasons.unshift({
      reasonCode: 'NO_PHONE',
      label: 'No phone number on file',
      detail: 'A phone-based action cannot execute without a contact number.',
      weight: 4,
    });
  }

  // ---- 4. Explicit no-action decisions ---------------------------------
  if (action.slug === 'no-action') {
    eligibility = 'NO_ACTION';
    reasons.unshift({
      reasonCode: 'NO_ACTION_JUSTIFIED',
      label: 'No action is the commercially correct outcome',
      detail: `Customer is in Lost Customers with ${ctx.frequency} lifetime purchases and INR ${inr(ctx.monetaryPaise)} net spend. The modelled return does not cover the INR ${inr(action.costPerContact * 100)} contact cost, so no outreach is recommended.`,
      weight: 5,
    });
  }

  const grossValue = action.expectedValue - action.costPerContact;
  const valueFactor = 0.5 + ctx.mScore / 10;
  const score = Number((grossValue * valueFactor).toFixed(3));

  if (action.slug === 'support-follow-up') {
    reasons.push({
      reasonCode: 'SERVICE_COST',
      label: `INR ${inr(ctx.serviceCostPaise)} support cost`,
      detail: `Support handling cost with ${ctx.openCases} open case(s) justifies a human follow-up.`,
      metricName: 'serviceCost',
      metricValue: Number((ctx.serviceCostPaise / 100).toFixed(2)),
      weight: 2,
    });
  }

  const explanation = buildExplanation(ctx, action, eligibility, suppression, reasons);

  return {
    action,
    eligibility,
    suppression,
    reasons,
    explanation,
    inputMetrics: {
      ruleVersion,
      segment: ctx.segmentSlug,
      recencyDays: ctx.recencyDays,
      frequency: ctx.frequency,
      netSpend: Number((ctx.monetaryPaise / 100).toFixed(2)),
      rScore: ctx.rScore,
      fScore: ctx.fScore,
      mScore: ctx.mScore,
      serviceCost: Number((ctx.serviceCostPaise / 100).toFixed(2)),
      openCases: ctx.openCases,
      escalatedCases: ctx.escalatedCases,
      marketingConsentGranted: consentState.granted,
      consentChannel: action.channel,
      actionChannel: action.channel,
      requiresMarketingConsent: action.requiresMarketingConsent,
    },
    score,
  };
}

function buildExplanation(
  ctx: RecommendationContext,
  action: ActionDefinition,
  eligibility: Eligibility,
  suppression: Suppression,
  reasons: RecommendationReason[],
): string {
  if (suppression === 'SUPPRESSED_CONSENT') {
    return `Marketing action suppressed because the customer withdrew ${action.channel} marketing consent. Recommended treatment would have been "${action.name}" based on ${ctx.frequency} purchases in the analysis window, INR ${inr(ctx.monetaryPaise)} net spend and ${ctx.recencyDays} days since the last purchase, but consent takes precedence.`;
  }
  if (eligibility === 'NO_ACTION') {
    return `No action recommended for this customer: ${reasons[reasons.length - 1]?.detail ?? 'low expected return'}`;
  }
  if (eligibility === 'SUPPRESSED') {
    return `"${action.name}" is suppressed (${suppression}). ${reasons[0]?.detail ?? ''}`;
  }
  return `Recommended ${action.name} because the customer has made ${ctx.frequency} completed purchases, has INR ${inr(ctx.monetaryPaise)} net spend after returns, and purchased ${ctx.recencyDays} days ago (RFM ${ctx.rScore}${ctx.fScore}${ctx.mScore}). ${ctx.segmentSlug} is the active segment.`;
}

