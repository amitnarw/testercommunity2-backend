-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'POINTS_DEDUCTED';
ALTER TYPE "NotificationType" ADD VALUE 'APP_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'APP_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'TEST_INVITATION';
ALTER TYPE "NotificationType" ADD VALUE 'GENERAL_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE 'REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE 'INSUFFICIENT_BALANCE';
