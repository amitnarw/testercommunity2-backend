-- AlterTable
ALTER TABLE "dashboard_and_hub" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- Backfill: spec's 24h recruiting window runs from approval. Existing
-- AVAILABLE/IN_REVIEW campaigns predate the column; seed from createdAt
-- (submission time <= approval time). Long-sitting campaigns will trip the
-- recruiting-window cron on its next tick and go to admin review, which is
-- the spec-correct outcome for stale campaigns.
UPDATE "dashboard_and_hub"
SET "approvedAt" = "createdAt"
WHERE "approvedAt" IS NULL
  AND "status" IN ('AVAILABLE', 'IN_REVIEW');
