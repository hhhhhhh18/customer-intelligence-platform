-- CreateEnum
CREATE TYPE "CustomerLifecycleStatus" AS ENUM ('ACTIVE', 'DORMANT', 'CHURNED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('WEB', 'MOBILE_APP', 'STORE', 'PHONE', 'MARKETPLACE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED');

-- CreateEnum
CREATE TYPE "EngagementEventType" AS ENUM ('SESSION_START', 'PAGE_VIEW', 'PRODUCT_VIEW', 'SEARCH', 'ADD_TO_CART', 'CHECKOUT_START', 'PURCHASE', 'EMAIL_OPEN', 'EMAIL_CLICK', 'PUSH_OPEN', 'SMS_CLICK', 'APP_OPEN', 'SUPPORT_VISIT', 'UNSUBSCRIBE_CLICK');

-- CreateEnum
CREATE TYPE "EngagementChannel" AS ENUM ('WEB', 'APP', 'EMAIL', 'SMS', 'PUSH', 'PHONE');

-- CreateEnum
CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('BILLING', 'DELIVERY', 'PRODUCT_QUALITY', 'RETURNS', 'ACCOUNT', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'PHONE', 'DIRECT_MAIL');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('MARKETING', 'TRANSACTIONAL', 'ANALYTICS', 'PROFILING');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN', 'PENDING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SegmentCategory" AS ENUM ('VALUE', 'LIFECYCLE', 'RISK', 'SERVICE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUPERSEDED', 'CONFLICT_FLAGGED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('LOYALTY_REWARD', 'PROMOTIONAL_DISCOUNT', 'RE_ENGAGEMENT', 'WELCOME_ONBOARDING', 'PRODUCT_RECOMMENDATION', 'SUPPORT_FOLLOW_UP', 'RETENTION_INTERVENTION', 'NO_ACTION');

-- CreateEnum
CREATE TYPE "RecommendationEligibility" AS ENUM ('ELIGIBLE', 'INELIGIBLE', 'SUPPRESSED', 'NO_ACTION');

-- CreateEnum
CREATE TYPE "SuppressionResult" AS ENUM ('NOT_SUPPRESSED', 'SUPPRESSED_CONSENT', 'SUPPRESSED_CONTACT_PREFERENCE', 'SUPPRESSED_OPEN_SUPPORT_CASE', 'SUPPRESSED_RECENT_CONTACT', 'SUPPRESSED_ACTIVE_COMPLAINT');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'DISMISSED', 'EXPIRED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "OutcomeStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILURE', 'NO_RESPONSE', 'UNATTRIBUTED');

-- CreateEnum
CREATE TYPE "ExceptionCategory" AS ENUM ('SEGMENT_CONFLICT', 'CONSENT_VIOLATION', 'RETURN_NOT_NETTED', 'OUTCOME_ATTRIBUTION', 'REFERENTIAL_INTEGRITY', 'DUPLICATE_RECORD', 'ARITHMETIC_MISMATCH', 'ENUM_VIOLATION', 'ID_FORMAT', 'CONSENT_LIFECYCLE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CheckOutcome" AS ENUM ('PASS', 'WARNING', 'FAIL');

-- CreateEnum
CREATE TYPE "GenerationProfile" AS ENUM ('SMALL', 'MEDIUM', 'FULL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "customerCode" VARCHAR(20) NOT NULL,
    "firstName" VARCHAR(80) NOT NULL,
    "lastName" VARCHAR(80) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "phone" VARCHAR(40),
    "country" VARCHAR(56) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "region" VARCHAR(80) NOT NULL,
    "signupDate" DATE NOT NULL,
    "birthDate" DATE,
    "lifecycle" "CustomerLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "acquisition" VARCHAR(40) NOT NULL,
    "loyaltyTier" VARCHAR(20),
    "preferredChannel" "EngagementChannel",
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "productCode" VARCHAR(20) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "brand" VARCHAR(60) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "isReturnable" BOOLEAN NOT NULL DEFAULT true,
    "launchDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "orderCode" VARCHAR(24) NOT NULL,
    "customerId" INTEGER NOT NULL,
    "orderDate" DATE NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "channel" "SalesChannel" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shippingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossTotal" DECIMAL(14,2) NOT NULL,
    "returnedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(14,2) NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "returnReason" VARCHAR(120),
    "campaignId" VARCHAR(32),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netLineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_events" (
    "id" BIGSERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "eventType" "EngagementEventType" NOT NULL,
    "channel" "EngagementChannel" NOT NULL,
    "sessionId" VARCHAR(40) NOT NULL,
    "occurredAt" TIMESTAMP(6) NOT NULL,
    "pagePath" VARCHAR(160),
    "deviceType" VARCHAR(24),
    "campaignId" VARCHAR(32),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_cases" (
    "id" SERIAL NOT NULL,
    "caseCode" VARCHAR(24) NOT NULL,
    "customerId" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(6) NOT NULL,
    "closedAt" TIMESTAMP(6),
    "status" "SupportCaseStatus" NOT NULL,
    "priority" "SupportPriority" NOT NULL,
    "category" "SupportCategory" NOT NULL,
    "channel" "EngagementChannel" NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "isEscalated" BOOLEAN NOT NULL DEFAULT false,
    "handlingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "satisfactionScore" INTEGER,
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" SERIAL NOT NULL,
    "consentCode" VARCHAR(28) NOT NULL,
    "customerId" INTEGER NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "source" VARCHAR(60) NOT NULL,
    "effectiveFrom" TIMESTAMP(6) NOT NULL,
    "effectiveTo" TIMESTAMP(6),
    "withdrawnAt" TIMESTAMP(6),
    "recordedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_rules" (
    "id" SERIAL NOT NULL,
    "segmentCode" VARCHAR(24) NOT NULL,
    "slug" VARCHAR(48) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "SegmentCategory" NOT NULL,
    "priority" INTEGER NOT NULL,
    "isExclusive" BOOLEAN NOT NULL DEFAULT true,
    "ruleVersion" VARCHAR(20) NOT NULL,
    "criteria" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "segment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_memberships" (
    "id" SERIAL NOT NULL,
    "membershipCode" VARCHAR(60) NOT NULL,
    "segmentId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(6) NOT NULL,
    "effectiveFrom" TIMESTAMP(6) NOT NULL,
    "effectiveTo" TIMESTAMP(6),
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "ruleVersion" VARCHAR(20) NOT NULL,
    "recencyDays" INTEGER NOT NULL,
    "frequency" INTEGER NOT NULL,
    "monetary" DECIMAL(14,2) NOT NULL,
    "rScore" INTEGER NOT NULL,
    "fScore" INTEGER NOT NULL,
    "mScore" INTEGER NOT NULL,
    "rfmScore" INTEGER NOT NULL,
    "serviceCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "assignmentReason" TEXT NOT NULL,
    "decisionInputs" JSONB NOT NULL,
    "isExclusiveConflict" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segment_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_catalog" (
    "id" SERIAL NOT NULL,
    "actionCode" VARCHAR(24) NOT NULL,
    "slug" VARCHAR(48) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "channel" "EngagementChannel" NOT NULL,
    "isPromotional" BOOLEAN NOT NULL DEFAULT false,
    "requiresMarketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "costPerContact" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expectedValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL,
    "eligibilityRules" JSONB NOT NULL,
    "suppressionRules" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "action_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" SERIAL NOT NULL,
    "recommendationCode" VARCHAR(28) NOT NULL,
    "customerId" INTEGER NOT NULL,
    "segmentId" INTEGER,
    "actionId" INTEGER NOT NULL,
    "runId" VARCHAR(32) NOT NULL,
    "recommendedAt" TIMESTAMP(6) NOT NULL,
    "eligibility" "RecommendationEligibility" NOT NULL,
    "suppressionResult" "SuppressionResult" NOT NULL DEFAULT 'NOT_SUPPRESSED',
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "score" DECIMAL(8,3) NOT NULL DEFAULT 0,
    "explanation" TEXT NOT NULL,
    "inputMetrics" JSONB NOT NULL,
    "ruleVersion" VARCHAR(20) NOT NULL,
    "sourcePipeline" VARCHAR(48) NOT NULL DEFAULT 'recommendation-engine-v1',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_reasons" (
    "id" SERIAL NOT NULL,
    "recommendationId" INTEGER NOT NULL,
    "reasonCode" VARCHAR(48) NOT NULL,
    "label" VARCHAR(140) NOT NULL,
    "detail" TEXT NOT NULL,
    "metricName" VARCHAR(48),
    "metricValue" DECIMAL(14,2),
    "thresholdValue" DECIMAL(14,2),
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_outcomes" (
    "id" SERIAL NOT NULL,
    "outcomeCode" VARCHAR(28) NOT NULL,
    "recommendationId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "actionId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "status" "OutcomeStatus" NOT NULL,
    "respondedAt" TIMESTAMP(6),
    "completedAt" TIMESTAMP(6),
    "revenueAttributed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "channel" "EngagementChannel" NOT NULL,
    "notes" TEXT,
    "isAttributionValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "action_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exception_records" (
    "id" SERIAL NOT NULL,
    "exceptionCode" VARCHAR(28) NOT NULL,
    "category" "ExceptionCategory" NOT NULL,
    "severity" "Severity" NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "customerId" INTEGER,
    "recommendationId" INTEGER,
    "expectedValue" VARCHAR(240),
    "actualValue" VARCHAR(240),
    "explanation" TEXT NOT NULL,
    "detectionRuleId" VARCHAR(40) NOT NULL,
    "detectedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(6),
    "resolutionNotes" TEXT,
    "evidence" JSONB NOT NULL,
    "groundTruthRef" VARCHAR(40),

    CONSTRAINT "exception_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "actor" VARCHAR(60) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "customerId" INTEGER,
    "correlationId" VARCHAR(40),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_runs" (
    "id" SERIAL NOT NULL,
    "runCode" VARCHAR(32) NOT NULL,
    "profile" "GenerationProfile" NOT NULL,
    "seed" INTEGER NOT NULL,
    "referenceDate" DATE NOT NULL,
    "customerCount" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "datasetHash" VARCHAR(80),
    "config" JSONB NOT NULL,
    "startedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(6),

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segmentation_runs" (
    "id" SERIAL NOT NULL,
    "runCode" VARCHAR(32) NOT NULL,
    "ruleVersion" VARCHAR(20) NOT NULL,
    "asOfDate" DATE NOT NULL,
    "customersScored" INTEGER NOT NULL,
    "membershipsCreated" INTEGER NOT NULL,
    "conflictsDetected" INTEGER NOT NULL,
    "unassignedCount" INTEGER NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(6),

    CONSTRAINT "segmentation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_runs" (
    "id" SERIAL NOT NULL,
    "runCode" VARCHAR(32) NOT NULL,
    "ruleVersion" VARCHAR(20) NOT NULL,
    "asOfDate" DATE NOT NULL,
    "processed" INTEGER NOT NULL,
    "eligibleCount" INTEGER NOT NULL,
    "suppressedCount" INTEGER NOT NULL,
    "noActionCount" INTEGER NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(6),

    CONSTRAINT "recommendation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_runs" (
    "id" SERIAL NOT NULL,
    "runCode" VARCHAR(32) NOT NULL,
    "startedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(6),
    "totalRecordsChecked" INTEGER NOT NULL,
    "checksPassed" INTEGER NOT NULL,
    "checksFailed" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "exceptionCount" INTEGER NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "datasetProfile" VARCHAR(20),
    "seed" INTEGER,
    "summary" JSONB NOT NULL,

    CONSTRAINT "data_quality_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_issues" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "ruleId" VARCHAR(40) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "outcome" "CheckOutcome" NOT NULL,
    "severity" "Severity" NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(64),
    "message" TEXT NOT NULL,
    "expected" VARCHAR(240),
    "actual" VARCHAR(240),
    "checkedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_customerCode_key" ON "customers"("customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_lastName_firstName_idx" ON "customers"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "customers_signupDate_idx" ON "customers"("signupDate");

-- CreateIndex
CREATE INDEX "customers_lifecycle_idx" ON "customers"("lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");

-- CreateIndex
CREATE INDEX "product_categories_parentId_idx" ON "product_categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "products_productCode_key" ON "products"("productCode");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderCode_key" ON "orders"("orderCode");

-- CreateIndex
CREATE INDEX "orders_customerId_orderDate_idx" ON "orders"("customerId", "orderDate");

-- CreateIndex
CREATE INDEX "orders_orderDate_idx" ON "orders"("orderDate");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_lines_orderId_idx" ON "order_lines"("orderId");

-- CreateIndex
CREATE INDEX "order_lines_productId_idx" ON "order_lines"("productId");

-- CreateIndex
CREATE INDEX "order_lines_customerId_idx" ON "order_lines"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "order_lines_orderId_lineNumber_key" ON "order_lines"("orderId", "lineNumber");

-- CreateIndex
CREATE INDEX "engagement_events_customerId_occurredAt_idx" ON "engagement_events"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "engagement_events_eventType_idx" ON "engagement_events"("eventType");

-- CreateIndex
CREATE INDEX "engagement_events_occurredAt_idx" ON "engagement_events"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_cases_caseCode_key" ON "support_cases"("caseCode");

-- CreateIndex
CREATE INDEX "support_cases_customerId_openedAt_idx" ON "support_cases"("customerId", "openedAt");

-- CreateIndex
CREATE INDEX "support_cases_status_idx" ON "support_cases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "consents_consentCode_key" ON "consents"("consentCode");

-- CreateIndex
CREATE INDEX "consents_customerId_purpose_channel_idx" ON "consents"("customerId", "purpose", "channel");

-- CreateIndex
CREATE INDEX "consents_status_idx" ON "consents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "consents_customerId_channel_purpose_effectiveFrom_key" ON "consents"("customerId", "channel", "purpose", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "segment_rules_segmentCode_key" ON "segment_rules"("segmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "segment_rules_slug_key" ON "segment_rules"("slug");

-- CreateIndex
CREATE INDEX "segment_rules_priority_idx" ON "segment_rules"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "segment_memberships_membershipCode_key" ON "segment_memberships"("membershipCode");

-- CreateIndex
CREATE INDEX "segment_memberships_customerId_status_idx" ON "segment_memberships"("customerId", "status");

-- CreateIndex
CREATE INDEX "segment_memberships_segmentId_status_idx" ON "segment_memberships"("segmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "segment_memberships_segmentId_customerId_effectiveFrom_key" ON "segment_memberships"("segmentId", "customerId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "action_catalog_actionCode_key" ON "action_catalog"("actionCode");

-- CreateIndex
CREATE UNIQUE INDEX "action_catalog_slug_key" ON "action_catalog"("slug");

-- CreateIndex
CREATE INDEX "action_catalog_actionType_idx" ON "action_catalog"("actionType");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_recommendationCode_key" ON "recommendations"("recommendationCode");

-- CreateIndex
CREATE INDEX "recommendations_customerId_recommendedAt_idx" ON "recommendations"("customerId", "recommendedAt");

-- CreateIndex
CREATE INDEX "recommendations_eligibility_suppressionResult_idx" ON "recommendations"("eligibility", "suppressionResult");

-- CreateIndex
CREATE INDEX "recommendations_actionId_idx" ON "recommendations"("actionId");

-- CreateIndex
CREATE INDEX "recommendations_segmentId_idx" ON "recommendations"("segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_customerId_runId_actionId_key" ON "recommendations"("customerId", "runId", "actionId");

-- CreateIndex
CREATE INDEX "recommendation_reasons_recommendationId_idx" ON "recommendation_reasons"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "action_outcomes_outcomeCode_key" ON "action_outcomes"("outcomeCode");

-- CreateIndex
CREATE INDEX "action_outcomes_recommendationId_idx" ON "action_outcomes"("recommendationId");

-- CreateIndex
CREATE INDEX "action_outcomes_customerId_idx" ON "action_outcomes"("customerId");

-- CreateIndex
CREATE INDEX "action_outcomes_status_idx" ON "action_outcomes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "exception_records_exceptionCode_key" ON "exception_records"("exceptionCode");

-- CreateIndex
CREATE INDEX "exception_records_category_status_idx" ON "exception_records"("category", "status");

-- CreateIndex
CREATE INDEX "exception_records_customerId_idx" ON "exception_records"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "exception_records_category_entityType_entityId_detectionRul_key" ON "exception_records"("category", "entityType", "entityId", "detectionRuleId");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "generation_runs_runCode_key" ON "generation_runs"("runCode");

-- CreateIndex
CREATE UNIQUE INDEX "segmentation_runs_runCode_key" ON "segmentation_runs"("runCode");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_runs_runCode_key" ON "recommendation_runs"("runCode");

-- CreateIndex
CREATE UNIQUE INDEX "data_quality_runs_runCode_key" ON "data_quality_runs"("runCode");

-- CreateIndex
CREATE INDEX "data_quality_issues_runId_outcome_idx" ON "data_quality_issues"("runId", "outcome");

-- CreateIndex
CREATE INDEX "data_quality_issues_ruleId_idx" ON "data_quality_issues"("ruleId");

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_memberships" ADD CONSTRAINT "segment_memberships_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segment_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_memberships" ADD CONSTRAINT "segment_memberships_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segment_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "action_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_reasons" ADD CONSTRAINT "recommendation_reasons_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_outcomes" ADD CONSTRAINT "action_outcomes_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_outcomes" ADD CONSTRAINT "action_outcomes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_outcomes" ADD CONSTRAINT "action_outcomes_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "action_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_outcomes" ADD CONSTRAINT "action_outcomes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_runId_fkey" FOREIGN KEY ("runId") REFERENCES "data_quality_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
