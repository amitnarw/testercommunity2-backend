-- AlterTable
ALTER TABLE "user" ALTER COLUMN "handshakeLevel" SET DEFAULT 0;

-- Spec: max 10 pending outgoing handshake requests per user (was 12).
UPDATE "system_config"
SET "value" = '10'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'handshake_request_limit_per_user';

-- Spec: L0 = new user (0 completions). Explicit row so DB-driven level
-- computation (getLevelFromCompletedCount) resolves level 0.
INSERT INTO "level_config" ("level", "threshold", "updatedAt")
VALUES (0, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("level") DO UPDATE SET "threshold" = 0, "updatedAt" = CURRENT_TIMESTAMP;
