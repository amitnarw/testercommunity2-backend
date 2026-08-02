-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "accent" TEXT NOT NULL DEFAULT 'primary',
ADD COLUMN     "badgeText" TEXT,
ADD COLUMN     "customPriceLabel" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "gradientFrom" TEXT,
ADD COLUMN     "gradientTo" TEXT,
ADD COLUMN     "isPopular" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
