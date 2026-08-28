-- S9: remove the legacy points economy. The platform now runs on
-- HANDSHAKE (barter) + Pro (packages/money). Points are no longer a
-- currency anywhere.

-- 1) Preserve transaction history: the old `points` column doubled as the
--    generic amount slot for BOTH points rows and money rows (e.g. PAID
--    rewards were written into it). Copy values into the new `amount`
--    column before dropping it.
ALTER TABLE "user_transactions" ADD COLUMN "amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
UPDATE "user_transactions" SET "amount" = COALESCE("points", 0);
ALTER TABLE "user_transactions" DROP COLUMN "points";

-- 2) Wallet: points balance removed; packages + money remain.
ALTER TABLE "user_wallet" DROP COLUMN "totalPoints";

-- 3) Campaigns: per-campaign reward/cost in points removed.
ALTER TABLE "dashboard_and_hub" DROP COLUMN "rewardPoints";
ALTER TABLE "dashboard_and_hub" DROP COLUMN "costPoints";

-- 4) ControlRoom: vestigial points knobs (withdrawals run on balanceMoney).
ALTER TABLE "control_room"
  DROP COLUMN IF EXISTS "profileSurveyPoints",
  DROP COLUMN IF EXISTS "pointsWithdrawalLimit",
  DROP COLUMN IF EXISTS "pointsWithdrawalThreshold";
