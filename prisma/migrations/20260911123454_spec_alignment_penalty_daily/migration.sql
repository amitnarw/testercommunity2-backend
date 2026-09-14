-- AlterTable
ALTER TABLE "penalty_task" ADD COLUMN     "penaltyDaysRequired" INTEGER NOT NULL DEFAULT 16,
ADD COLUMN     "penaltyStartAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "penalty_daily_proof" (
    "id" SERIAL NOT NULL,
    "penaltyTaskId" INTEGER NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "proofImageUrl" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'VERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "penalty_daily_proof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "penalty_daily_proof_penaltyTaskId_idx" ON "penalty_daily_proof"("penaltyTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "penalty_daily_proof_penaltyTaskId_dayNumber_key" ON "penalty_daily_proof"("penaltyTaskId", "dayNumber");

-- AddForeignKey
ALTER TABLE "penalty_daily_proof" ADD CONSTRAINT "penalty_daily_proof_penaltyTaskId_fkey" FOREIGN KEY ("penaltyTaskId") REFERENCES "penalty_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
