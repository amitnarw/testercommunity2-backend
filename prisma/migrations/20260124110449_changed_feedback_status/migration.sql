/*
  Warnings:

  - The values [FEEDBACK_MEDIA] on the enum `MediaCategory` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MediaCategory_new" AS ENUM ('APP_LOGO', 'SCREENSHOT', 'FEATURED_VIDEO', 'FEATURED_IMAGE', 'AUTHOR_IMAGE', 'OTHER');
ALTER TABLE "media" ALTER COLUMN "category" TYPE "MediaCategory_new" USING ("category"::text::"MediaCategory_new");
ALTER TYPE "MediaCategory" RENAME TO "MediaCategory_old";
ALTER TYPE "MediaCategory_new" RENAME TO "MediaCategory";
DROP TYPE "public"."MediaCategory_old";
COMMIT;
