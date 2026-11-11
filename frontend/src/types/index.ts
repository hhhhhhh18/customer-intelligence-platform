export interface ApiEnvelope<T> {
  data: T;
}

export interface PagedEnvelope<T> {
  data: T[];
  meta: PageMeta;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export interface ApiList<T> {
  data: T[];
  meta: PageMeta;
}

export interface CustomerRow {
  id: number;
  customerCode: string;
  firstName: string;
  lastName: string;
  email: string;
  signupDate: string;
  lifecycle: string;
  totalOrders: number;
  netSpend: string;
  lastPurchase: string | null;
  rfmScore: number | null;
  rScore: number | null;
  fScore: number | null;
  mScore: number | null;
  segmentSlug: string | null;
  segmentName: string | null;
  consentStatus: string;
}

export interface Segment {
  id: number;
  segmentCode: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priority: number;
  isExclusive: boolean;
  ruleVersion: string;
  criteria: Record<string, unknown>;
  explanation: string;
  customerCount: number;
  shareOfBase: number;
}

export interface RecommendationRow {
  id: number;
  recommendationCode: string;
  recommendedAt: string;
  eligibility: string;
  suppressionResult: string;
  status: string;
  explanation: string;
  ruleVersion: string;
  score: string;
  customer: { id: number; customerCode: string; firstName: string; lastName: string; email: string };
  action: { name: string; slug: string; isPromotional: boolean; actionType: string; channel: string };
  segment: { name: string; slug: string } | null;
}

export interface ConsentRow {
  id: number;
  consentCode: string;
  channel: string;
  purpose: string;
  status: string;
  source: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  withdrawnAt: string | null;
  customer: { customerCode: string; firstName: string; lastName: string; email: string; preferredChannel: string | null };
}

export interface ExceptionRow {
  id: number;
  exceptionCode: string;
  category: string;
  severity: string;
  entityType: string;
  entityId: string;
  expectedValue: string | null;
  actualValue: string | null;
  explanation: string;
  detectionRuleId: string;
  detectedAt: string;
  status: string;
  resolutionNotes: string | null;
  evidence: Record<string, unknown>;
  customer: { customerCode: string; firstName: string; lastName: string } | null;
}

export interface OutcomeRow {
  id: number;
  outcomeCode: string;
  status: string;
  revenueAttributed: string;
  respondedAt: string | null;
  completedAt: string | null;
  isAttributionValid: boolean;
  customer: { customerCode: string; firstName: string; lastName: string };
  action: { name: string; slug: string; actionType: string };
  recommendation: {
    recommendationCode: string;
    actionId: number;
    eligibility: string;
    segment: { name: string; slug: string } | null;
  };
}

export interface DashboardData {
  kpis: {
    totalCustomers: number;
    totalOrders: number;
    totalNetRevenue: number;
    activeCustomers: number;
    dormantCustomers: number;
    atRiskCustomers: number;
    eligibleRecommendations: number;
    suppressedRecommendations: number;
    totalRecommendations: number;
    openExceptions: number;
    engagementEvents: number;
    supportCases: number;
    dataQualityScore: number | null;
    outcomeSuccessRate: number;
  };
  segmentDistribution: Array<{ slug: string; name: string; count: number; share: number }>;
  purchaseTrend: Array<{ month: string; orders: number; revenue: number; customers: number }>;
  rfmDistribution: Array<{ score: number; band: string; count: number }>;
  recommendationDistribution: Array<{ action: string; slug: string; eligible: number; suppressed: number; noAction: number }>;
  outcomePerformance: Array<{ action: string; slug: string; success: number; failure: number; noResponse: number; revenue: number }>;
  exceptionBreakdown: Array<{ category: string; count: number }>;
  recentExceptions: ExceptionRow[];
  topSegments: Array<{ name: string; slug: string; revenue: number; customers: number }>;
  engagementTrend: Array<{ month: string; events: number }>;
  supportSummary: Array<{ status: string; count: number }>;
  dataset: {
    profile: string;
    seed: number;
    referenceDate: string;
    customerCount: number;
    orderCount: number;
    eventCount: number;
    datasetHash: string;
    loadedAt: string;
  } | null;
}


