-- CreateEnum
CREATE TYPE "TesterStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REMOVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "EarningAction" ADD VALUE 'APP_SUBMISSION';

-- AlterTable
ALTER TABLE "dashboard_and_hub" ADD COLUMN     "costPoints" DOUBLE PRECISION,
ADD COLUMN     "rewardPoints" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "tester_relation" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "daysCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "status" "TesterStatus" NOT NULL DEFAULT 'IN_PROGRESS';
