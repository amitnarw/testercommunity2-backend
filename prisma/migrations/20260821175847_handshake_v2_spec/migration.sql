-- CreateEnum
CREATE TYPE "HandshakeRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'MUTUAL_MATCHED');

-- CreateEnum
CREATE TYPE "PenaltyTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "AddOnCategory" AS ENUM ('PROFESSIONAL_TESTER', 'PRIORITY_SUPPORT', 'EXTRA_TESTING');

-- CreateEnum
CREATE TYPE "AddOnPurchaseStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ProfessionalTesterStatus" AS ENUM ('OPEN', 'FILLED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DashboardAndHubStatus" ADD VALUE 'PENDING_ADMIN_REVIEW';
ALTER TYPE "DashboardAndHubStatus" ADD VALUE 'APPROVED';
ALTER TYPE "DashboardAndHubStatus" ADD VALUE 'FINDING_TESTERS';
ALTER TYPE "DashboardAndHubStatus" ADD VALUE 'WAITING_FOR_PARTNERS';
ALTER TYPE "DashboardAndHubStatus" ADD VALUE 'TESTING_ACTIVE';
ALTER TYPE "DashboardAndHubStatus" ADD VALUE 'UNDER_ADMIN_REVIEW';
ALTER TYPE "DashboardAndHubStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "DashboardAndHubStatus" ADD VALUE 'REMOVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TesterStatus" ADD VALUE 'MISSED';
ALTER TYPE "TesterStatus" ADD VALUE 'PENALIZED';
ALTER TYPE "TesterStatus" ADD VALUE 'REPLACED';

-- AlterTable
ALTER TABLE "dashboard_and_hub" ADD COLUMN     "escalatedToAdminAt" TIMESTAMP(3),
ADD COLUMN     "testingStartEligibleAt" TIMESTAMP(3),
ADD COLUMN     "waitingPeriodStartedAt" TIMESTAMP(3),
ALTER COLUMN "totalDay" SET DEFAULT 16;

-- AlterTable
ALTER TABLE "handshake_subscription" ADD COLUMN     "deprecatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "deprecatedHandshakeSubscriptionStatus" TEXT,
ADD COLUMN     "eliteBadge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eliteBadgeAwardedAt" TIMESTAMP(3),
ADD COLUMN     "eliteBadgeAwardedBy" TEXT,
ADD COLUMN     "eliteBadgeReason" TEXT;

-- CreateTable
CREATE TABLE "handshake_request" (
    "id" SERIAL NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "requestedAppId" INTEGER NOT NULL,
    "offeredAppId" INTEGER,
    "status" "HandshakeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "rejectionReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handshake_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalty_task" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceRelationId" INTEGER,
    "sourceCampaignId" INTEGER,
    "reason" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "PenaltyTaskStatus" NOT NULL DEFAULT 'PENDING',
    "taskAppId" INTEGER,
    "proofImageUrl" TEXT,
    "verifiedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "penalty_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missed_day" (
    "id" SERIAL NOT NULL,
    "testerRelationId" INTEGER NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missed_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_on" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceINR" INTEGER NOT NULL,
    "category" "AddOnCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "add_on_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_on_purchase" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "addOnId" INTEGER NOT NULL,
    "razorpayOrderId" TEXT,
    "amountINR" INTEGER NOT NULL,
    "status" "AddOnPurchaseStatus" NOT NULL DEFAULT 'CREATED',
    "purchasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "add_on_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_tester_assignment" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "assignedByAdminId" TEXT NOT NULL,
    "professionalUserId" TEXT,
    "status" "ProfessionalTesterStatus" NOT NULL DEFAULT 'OPEN',
    "feeINR" INTEGER NOT NULL DEFAULT 0,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_tester_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_config" (
    "level" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "level_config_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "handshake_request_toUserId_status_expiresAt_idx" ON "handshake_request"("toUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "handshake_request_fromUserId_status_idx" ON "handshake_request"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "handshake_request_status_expiresAt_idx" ON "handshake_request"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "penalty_task_userId_status_idx" ON "penalty_task"("userId", "status");

-- CreateIndex
CREATE INDEX "missed_day_testerRelationId_idx" ON "missed_day"("testerRelationId");

-- CreateIndex
CREATE UNIQUE INDEX "missed_day_testerRelationId_dayNumber_key" ON "missed_day"("testerRelationId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "add_on_purchase_razorpayOrderId_key" ON "add_on_purchase"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "add_on_purchase_userId_status_idx" ON "add_on_purchase"("userId", "status");

-- CreateIndex
CREATE INDEX "add_on_purchase_campaignId_idx" ON "add_on_purchase"("campaignId");

-- CreateIndex
CREATE INDEX "professional_tester_assignment_campaignId_status_idx" ON "professional_tester_assignment"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "level_config_threshold_key" ON "level_config"("threshold");

-- AddForeignKey
ALTER TABLE "handshake_request" ADD CONSTRAINT "handshake_request_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handshake_request" ADD CONSTRAINT "handshake_request_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handshake_request" ADD CONSTRAINT "handshake_request_requestedAppId_fkey" FOREIGN KEY ("requestedAppId") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handshake_request" ADD CONSTRAINT "handshake_request_offeredAppId_fkey" FOREIGN KEY ("offeredAppId") REFERENCES "dashboard_and_hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_task" ADD CONSTRAINT "penalty_task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_task" ADD CONSTRAINT "penalty_task_sourceRelationId_fkey" FOREIGN KEY ("sourceRelationId") REFERENCES "tester_relation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_task" ADD CONSTRAINT "penalty_task_sourceCampaignId_fkey" FOREIGN KEY ("sourceCampaignId") REFERENCES "dashboard_and_hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_task" ADD CONSTRAINT "penalty_task_taskAppId_fkey" FOREIGN KEY ("taskAppId") REFERENCES "dashboard_and_hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_day" ADD CONSTRAINT "missed_day_testerRelationId_fkey" FOREIGN KEY ("testerRelationId") REFERENCES "tester_relation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_on_purchase" ADD CONSTRAINT "add_on_purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_on_purchase" ADD CONSTRAINT "add_on_purchase_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_on_purchase" ADD CONSTRAINT "add_on_purchase_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "add_on"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_tester_assignment" ADD CONSTRAINT "professional_tester_assignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed LevelConfig per spec §33
-- L1=10, L2=25, L3=50, L4=100, L5=250, L6=500, L7=1000, L8=2500, L9=5000
INSERT INTO "level_config" ("level", "threshold", "updatedAt") VALUES
  (1, 10, CURRENT_TIMESTAMP),
  (2, 25, CURRENT_TIMESTAMP),
  (3, 50, CURRENT_TIMESTAMP),
  (4, 100, CURRENT_TIMESTAMP),
  (5, 250, CURRENT_TIMESTAMP),
  (6, 500, CURRENT_TIMESTAMP),
  (7, 1000, CURRENT_TIMESTAMP),
  (8, 2500, CURRENT_TIMESTAMP),
  (9, 5000, CURRENT_TIMESTAMP);

-- Seed SystemConfig defaults for handshake testing
INSERT INTO "system_config" ("key", "value", "updatedAt") VALUES
  ('handshake_request_expiry_days', '7'::jsonb, CURRENT_TIMESTAMP),
  ('handshake_request_limit_per_user', '20'::jsonb, CURRENT_TIMESTAMP),
  ('handshake_24h_wait_hours', '24'::jsonb, CURRENT_TIMESTAMP),
  ('professional_tester_fee_inr', '499'::jsonb, CURRENT_TIMESTAMP),
  ('handshake_testing_period_days', '16'::jsonb, CURRENT_TIMESTAMP);

-- Mark all existing handshake_subscription rows as legacy
UPDATE "handshake_subscription"
SET "deprecatedAt" = CURRENT_TIMESTAMP
WHERE "deprecatedAt" IS NULL;

-- Backfill legacy subscription status onto User for audit purposes
UPDATE "user" u
SET "deprecatedHandshakeSubscriptionStatus" = COALESCE(
  (
    SELECT s.status::text
    FROM "handshake_subscription" s
    WHERE s."userId" = u.id AND s."deprecatedAt" IS NOT NULL
    ORDER BY s."createdAt" DESC
    LIMIT 1
  ),
  NULL
)
WHERE "deprecatedHandshakeSubscriptionStatus" IS NULL;

-- Recompute User.handshakeLevel against new spec §33 thresholds
-- Level = highest L where level_config.threshold <= handshakeCompletedCount, max 9
-- Default to 1 (new user) when completedCount < 10
UPDATE "user" u
SET "handshakeLevel" = COALESCE(
  (
    SELECT MAX(lc.level)
    FROM "level_config" lc
    WHERE lc.threshold <= u."handshakeCompletedCount"
  ),
  1
)
WHERE EXISTS (SELECT 1 FROM "level_config");
