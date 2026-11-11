/**
 * Next-best-action catalogue.  Seeded into `action_catalog`; the engine only
 * ever selects from these rows, so a recommendation can never reference an
 * action that does not exist.
 *
 * `requiresMarketingConsent` is the hard gate: any action with this flag can
 * only become ELIGIBLE when the customer has an active GRANTED marketing
 * consent for the action's channel.
 */
export type ActionSlug =
  | 'loyalty-reward'
  | 'promotional-discount'
  | 're-engagement-campaign'
  | 'welcome-onboarding'
  | 'product-recommendation'
  | 'support-follow-up'
  | 'retention-intervention'
  | 'no-action';

export interface ActionDefinition {
  slug: ActionSlug;
  name: string;
  description: string;
  actionType:
    | 'LOYALTY_REWARD'
    | 'PROMOTIONAL_DISCOUNT'
    | 'RE_ENGAGEMENT'
    | 'WELCOME_ONBOARDING'
    | 'PRODUCT_RECOMMENDATION'
    | 'SUPPORT_FOLLOW_UP'
    | 'RETENTION_INTERVENTION'
    | 'NO_ACTION';
  channel: 'EMAIL' | 'SMS' | 'PUSH' | 'PHONE' | 'DIRECT_MAIL' | 'WEB' | 'APP';
  isPromotional: boolean;
  requiresMarketingConsent: boolean;
  costPerContact: number;
  expectedValue: number;
  priority: number;
  eligibilityRules: Record<string, unknown>;
  suppressionRules: Record<string, unknown>;
}

export const ACTION_CATALOG: ActionDefinition[] = [
  {
    slug: 'loyalty-reward',
    name: 'Loyalty Reward',
    description: 'Thank the customer with a tier-appropriate reward and reinforce repeat purchase behaviour.',
    actionType: 'LOYALTY_REWARD',
    channel: 'EMAIL',
    isPromotional: true,
    requiresMarketingConsent: true,
    costPerContact: 180,
    expectedValue: 4200,
    priority: 20,
    eligibilityRules: { segments: ['champions'], minFrequency: 4 },
    suppressionRules: { requiresMarketingConsent: true, suppressOnOpenComplaint: true, frequencyCapDays: 14 },
  },
  {
    slug: 'promotional-discount',
    name: 'Promotional Discount',
    description: 'Time-boxed discount offer to lift short-term conversion.',
    actionType: 'PROMOTIONAL_DISCOUNT',
    channel: 'EMAIL',
    isPromotional: true,
    requiresMarketingConsent: true,
    costPerContact: 250,
    expectedValue: 3100,
    priority: 60,
    eligibilityRules: { segments: ['loyal-customers', 'potential-loyalists'], minRecencyScore: 3 },
    suppressionRules: { requiresMarketingConsent: true, suppressOnOpenComplaint: true, frequencyCapDays: 21 },
  },
  {
    slug: 're-engagement-campaign',
    name: 'Re-engagement Campaign',
    description: 'Win-back message for customers whose purchase frequency has dropped.',
    actionType: 'RE_ENGAGEMENT',
    channel: 'EMAIL',
    isPromotional: true,
    requiresMarketingConsent: true,
    costPerContact: 120,
    expectedValue: 2600,
    priority: 40,
    eligibilityRules: { segments: ['at-risk-customers', 'hibernating-customers'], minRecencyDays: 60 },
    suppressionRules: { requiresMarketingConsent: true, suppressOnOpenComplaint: true, frequencyCapDays: 14 },
  },
  {
    slug: 'welcome-onboarding',
    name: 'Welcome / Onboarding Message',
    description: 'Onboarding sequence that explains the value proposition and encourages a second purchase.',
    actionType: 'WELCOME_ONBOARDING',
    channel: 'EMAIL',
    isPromotional: true,
    requiresMarketingConsent: true,
    costPerContact: 40,
    expectedValue: 1800,
    priority: 30,
    eligibilityRules: { segments: ['new-customers'], maxTenureDays: 90 },
    suppressionRules: { requiresMarketingConsent: true, suppressOnOpenComplaint: true, frequencyCapDays: 7 },
  },
  {
    slug: 'product-recommendation',
    name: 'Product Recommendation',
    description: 'Category-affinity product suggestions based on past purchases.',
    actionType: 'PRODUCT_RECOMMENDATION',
    channel: 'EMAIL',
    isPromotional: true,
    requiresMarketingConsent: true,
    costPerContact: 30,
    expectedValue: 1500,
    priority: 50,
    eligibilityRules: { segments: ['loyal-customers', 'potential-loyalists'], minFrequency: 2 },
    suppressionRules: { requiresMarketingConsent: true, suppressOnOpenComplaint: true, frequencyCapDays: 10 },
  },
  {
    slug: 'support-follow-up',
    name: 'Customer Support Follow-up',
    description: 'Service recovery call from the support team for customers with unresolved or costly cases.',
    actionType: 'SUPPORT_FOLLOW_UP',
    channel: 'PHONE',
    isPromotional: false,
    requiresMarketingConsent: false,
    costPerContact: 320,
    expectedValue: 2200,
    priority: 10,
    eligibilityRules: { segments: ['high-service-cost'], minOpenCases: 1 },
    suppressionRules: { requiresMarketingConsent: false, suppressOnOpenComplaint: false, frequencyCapDays: 5 },
  },
  {
    slug: 'retention-intervention',
    name: 'Retention Intervention',
    description: 'Account-manager outreach for high-value customers showing churn signals.',
    actionType: 'RETENTION_INTERVENTION',
    channel: 'PHONE',
    isPromotional: false,
    requiresMarketingConsent: false,
    costPerContact: 450,
    expectedValue: 6500,
    priority: 15,
    eligibilityRules: { segments: ['cannot-lose-them'], minMonetaryScore: 4 },
    suppressionRules: { requiresMarketingConsent: false, suppressOnOpenComplaint: false, frequencyCapDays: 30 },
  },
  {
    slug: 'no-action',
    name: 'No Marketing Action',
    description: 'Deliberate no-contact decision: the expected return does not justify the contact cost or the customer is not reachable.',
    actionType: 'NO_ACTION',
    channel: 'EMAIL',
    isPromotional: false,
    requiresMarketingConsent: false,
    costPerContact: 0,
    expectedValue: 0,
    priority: 99,
    eligibilityRules: { segments: ['lost-customers'] },
    suppressionRules: { requiresMarketingConsent: false, suppressOnOpenComplaint: false, frequencyCapDays: 0 },
  },
];

export const ACTION_BY_SLUG = new Map(ACTION_CATALOG.map((a) => [a.slug, a]));
