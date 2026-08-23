-- S5b-4: Backfill tester capacity for HANDSHAKE campaigns created via the
-- relaxed 3-field path, which defaulted totalTester to 0. A zero capacity
-- makes every accept fail (currentTester < totalTester is never true).
-- 12 = the L1 slot cap floor per spec.
UPDATE "dashboard_and_hub"
SET "totalTester" = 12
WHERE "appType" = 'HANDSHAKE'
  AND "totalTester" <= 0;
