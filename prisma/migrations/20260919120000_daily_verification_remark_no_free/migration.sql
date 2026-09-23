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
    -- A previous failed attempt left an orphan "_new" type behind (DDL was
    -- not rolled back). Drop it first so CREATE TYPE can't fail.
    EXECUTE 'DROP TYPE IF EXISTS "DashboardAndHubAppType_new"';
    EXECUTE 'CREATE TYPE "DashboardAndHubAppType_new" AS ENUM (''PAID'', ''HANDSHAKE'')';
    EXECUTE 'ALTER TABLE "dashboard_and_hub" ALTER COLUMN "appType" TYPE "DashboardAndHubAppType_new" USING "appType"::text::"DashboardAndHubAppType_new"';
    EXECUTE 'ALTER TYPE "DashboardAndHubAppType" RENAME TO "DashboardAndHubAppType_old"';
    EXECUTE 'ALTER TYPE "DashboardAndHubAppType_new" RENAME TO "DashboardAndHubAppType"';
    EXECUTE 'DROP TYPE "DashboardAndHubAppType_old"';
  ELSE
    -- FREE is already gone from the enum: just sweep any orphan "_new"
    -- type so DB state converges no matter which path a failed attempt took.
    EXECUTE 'DROP TYPE IF EXISTS "DashboardAndHubAppType_new"';
  END IF;
END $$;

