-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FaqCategory" ADD VALUE 'pricing';
ALTER TYPE "FaqCategory" ADD VALUE 'google_play_guide';
ALTER TYPE "FaqCategory" ADD VALUE 'billing';

-- AlterTable
ALTER TABLE "faq" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
