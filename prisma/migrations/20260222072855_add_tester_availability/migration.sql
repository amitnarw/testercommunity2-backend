-- CreateEnum
CREATE TYPE "TesterAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'AWAY', 'DO_NOT_DISTURB');

-- AlterTable
ALTER TABLE "user_detail" ADD COLUMN     "availability" "TesterAvailability" DEFAULT 'AVAILABLE';
