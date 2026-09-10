-- Allow the same app (matching appName / appLogoUrl / packageName) to be
-- submitted in more than one testing type (e.g. both Pro Testing and
-- Handshake Testing). Previously the three global unique indexes below made
-- that impossible; duplicate checks are now scoped to the same
-- (appType, status != DRAFT) campaign by application code.

-- DropIndex
DROP INDEX IF EXISTS "android_app_appName_key";
DROP INDEX IF EXISTS "android_app_appLogoUrl_key";
DROP INDEX IF EXISTS "android_app_packageName_key";

-- CreateIndex (keep fast lookups for the per-type duplicate check)
CREATE INDEX IF NOT EXISTS "android_app_appName_idx" ON "android_app"("appName");
CREATE INDEX IF NOT EXISTS "android_app_packageName_idx" ON "android_app"("packageName");
