-- S6-9: FREE/PAID campaigns must never sit in WAITING_FOR_PARTNERS ,  that
-- state is a HANDSHAKE-only lifecycle stage (24h partner window). Legacy
-- verticals activate immediately on fill. Unstick any rows that entered
-- WAITING before the S6-7 gating:
--   full (currentTester >= totalTester) -> IN_TESTING with dates from now,
--   otherwise -> AVAILABLE.
UPDATE "dashboard_and_hub"
SET "status" = 'IN_TESTING',
    "testingStartDate" = CURRENT_TIMESTAMP,
    "testingEndDate" = CURRENT_TIMESTAMP + make_interval(days => COALESCE("totalDay", 14)),
    "testingStartEligibleAt" = NULL,
    "waitingPeriodStartedAt" = NULL,
    "escalatedToAdminAt" = NULL
WHERE "appType" IN ('FREE', 'PAID')
  AND "status" = 'WAITING_FOR_PARTNERS'
  AND "totalTester" > 0
  AND "currentTester" >= "totalTester";

UPDATE "dashboard_and_hub"
SET "status" = 'AVAILABLE',
    "testingStartEligibleAt" = NULL,
    "waitingPeriodStartedAt" = NULL,
    "escalatedToAdminAt" = NULL
WHERE "appType" IN ('FREE', 'PAID')
  AND "status" = 'WAITING_FOR_PARTNERS';
