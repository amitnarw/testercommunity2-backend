-- CreateEnum
CREATE TYPE "BlogCategory" AS ENUM ('AUTOMATION', 'UI_UX', 'SECURITY', 'AI', 'MOBILE', 'DEVOPS', 'GENERAL');

-- AlterTable
ALTER TABLE "blog" ADD COLUMN     "category" "BlogCategory" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "testimonial" ADD COLUMN     "title" TEXT;
