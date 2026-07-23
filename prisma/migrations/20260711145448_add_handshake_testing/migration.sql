-- CreateEnum
CREATE TYPE "HandshakeLinkStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HandshakeSubscriptionStatus" AS ENUM ('CREATED', 'AUTHENTICATED', 'ACTIVE', 'PENDING', 'HALTED', 'CANCELLED', 'COMPLETED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "DashboardAndHubAppType" ADD VALUE 'HANDSHAKE';

-- AlterTable
ALTER TABLE "tester_relation" ADD COLUMN     "offeredAppId" INTEGER;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "handshakeCompletedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "handshakeLevel" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "handshake_link" (
    "id" SERIAL NOT NULL,
    "relationAId" INTEGER NOT NULL,
    "relationBId" INTEGER NOT NULL,
    "aBlockedUntil" TIMESTAMP(3),
    "bBlockedUntil" TIMESTAMP(3),
    "lastProcessedDay" INTEGER NOT NULL DEFAULT 0,
    "status" "HandshakeLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handshake_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handshake_subscription" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "razorpaySubscriptionId" TEXT NOT NULL,
    "razorpayPlanId" TEXT NOT NULL,
    "status" "HandshakeSubscriptionStatus" NOT NULL DEFAULT 'CREATED',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "paidCount" INTEGER NOT NULL DEFAULT 0,
    "totalCycles" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handshake_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "handshake_link_relationAId_key" ON "handshake_link"("relationAId");

-- CreateIndex
CREATE UNIQUE INDEX "handshake_link_relationBId_key" ON "handshake_link"("relationBId");

-- CreateIndex
CREATE UNIQUE INDEX "handshake_subscription_razorpaySubscriptionId_key" ON "handshake_subscription"("razorpaySubscriptionId");

-- AddForeignKey
ALTER TABLE "tester_relation" ADD CONSTRAINT "tester_relation_offeredAppId_fkey" FOREIGN KEY ("offeredAppId") REFERENCES "dashboard_and_hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handshake_link" ADD CONSTRAINT "handshake_link_relationAId_fkey" FOREIGN KEY ("relationAId") REFERENCES "tester_relation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handshake_link" ADD CONSTRAINT "handshake_link_relationBId_fkey" FOREIGN KEY ("relationBId") REFERENCES "tester_relation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handshake_subscription" ADD CONSTRAINT "handshake_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
