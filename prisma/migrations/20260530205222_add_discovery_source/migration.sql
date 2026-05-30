-- AlterTable
ALTER TABLE "user_detail" ADD COLUMN     "discovery_source" TEXT,
ADD COLUMN     "discovery_source_answered" BOOLEAN NOT NULL DEFAULT false;
