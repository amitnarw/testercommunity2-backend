-- Recompute User.handshakeLevel against the updated spec thresholds
-- (L0 row added in spec_alignment_phase1).
-- Level = highest L where level_config.threshold <= handshakeCompletedCount.
-- Default to 0 (new user) when completedCount < 10. Idempotent.
UPDATE "user" u
SET "handshakeLevel" = COALESCE(
  (
    SELECT MAX(lc.level)
    FROM "level_config" lc
    WHERE lc.threshold <= u."handshakeCompletedCount"
  ),
  0
)
WHERE EXISTS (SELECT 1 FROM "level_config");