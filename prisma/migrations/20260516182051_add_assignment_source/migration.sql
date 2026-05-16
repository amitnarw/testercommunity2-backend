-- CreateEnum
CREATE TYPE "TesterAssignmentSource" AS ENUM ('SELF_JOIN', 'ADMIN_ASSIGNED');

-- AlterTable
ALTER TABLE "tester_relation" ADD COLUMN     "assignmentSource" "TesterAssignmentSource" NOT NULL DEFAULT 'SELF_JOIN';
