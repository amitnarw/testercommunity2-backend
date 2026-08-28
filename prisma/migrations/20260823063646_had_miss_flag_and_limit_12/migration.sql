-- AlterTable
ALTER TABLE "tester_relation" ADD COLUMN     "hadMissSinceStart" BOOLEAN NOT NULL DEFAULT false;

-- S8-G2: handwritten spec wants a 12-request outgoing cap; the seeded default
-- was 20. Tighten the existing SystemConfig row (code fallback also updated to
-- 12 in handshakeRequest.controller.ts).
UPDATE "system_config"
SET "value" = '12'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'handshake_request_limit_per_user';
