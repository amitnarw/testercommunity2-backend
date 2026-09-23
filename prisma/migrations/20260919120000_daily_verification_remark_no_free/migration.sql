-- Daily verification remark: mandatory for HANDSHAKE campaigns (enforced in submitDailyVerification).
-- Nullable so pre-existing rows stay valid.
ALTER TABLE "daily_tester_verification" ADD COLUMN IF NOT EXISTS "remark" TEXT;

-- Remove the dead FREE testing type. Postgres has no ALTER TYPE ... DROP VALUE,
-- hence the full type recreation. Guarded: runs only if FREE still exists, so
-- the migration is safe to re-run (e.g. after a failed attempt).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'DashboardAndHubAppType'
      AND e.enumlabel = 'FREE'
  ) THEN
    EXECUTE 'CREATE TYPE "DashboardAndHubAppType_new" AS ENUM (''PAID'', ''HANDSHAKE'')';
    EXECUTE 'ALTER TABLE "dashboard_and_hub" ALTER COLUMN "appType" TYPE "DashboardAndHubAppType_new" USING "appType"::text::"DashboardAndHubAppType_new"';
    EXECUTE 'ALTER TYPE "DashboardAndHubAppType" RENAME TO "DashboardAndHubAppType_old"';
    EXECUTE 'ALTER TYPE "DashboardAndHubAppType_new" RENAME TO "DashboardAndHubAppType"';
    EXECUTE 'DROP TYPE "DashboardAndHubAppType_old"';
  END IF;
END $$;

