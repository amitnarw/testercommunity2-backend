-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "daily_tester_verification" (
    "id" SERIAL NOT NULL,
    "testerRelationId" INTEGER NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "proofImageUrl" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "metaData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_tester_verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_tester_verification_testerRelationId_dayNumber_key" ON "daily_tester_verification"("testerRelationId", "dayNumber");

-- AddForeignKey
ALTER TABLE "daily_tester_verification" ADD CONSTRAINT "daily_tester_verification_testerRelationId_fkey" FOREIGN KEY ("testerRelationId") REFERENCES "tester_relation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
