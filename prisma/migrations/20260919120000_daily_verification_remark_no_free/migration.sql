-- Daily verification remark: mandatory for HANDSHAKE campaigns (enforced in submitDailyVerification).
-- Nullable so pre-existing rows stay valid.
ALTER TABLE "daily_tester_verification" ADD COLUMN "remark" TEXT;

-- Remove the dead FREE testing type. Verified zero FREE campaigns exist,
-- so the USING cast is safe. Postgres has no ALTER TYPE ... DROP VALUE,
-- hence the full type recreation.
CREATE TYPE "DashboardAndHubAppType_new" AS ENUM ('PAID', 'HANDSHAKE');
ALTER TABLE "dashboard_and_hub" ALTER COLUMN "appType" TYPE "DashboardAndHubAppType_new" USING "appType"::text::"DashboardAndHubAppType_new";
ALTER TYPE "DashboardAndHubAppType" RENAME TO "DashboardAndHubAppType_old";
ALTER TYPE "DashboardAndHubAppType_new" RENAME TO "DashboardAndHubAppType";
DROP TYPE "DashboardAndHubAppType_old";

