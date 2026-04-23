/*
  Warnings:

  - You are about to drop the column `description` on the `blog` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[slug]` on the table `blog` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `authorAvatarUrl` to the `blog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `content` to the `blog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `excerpt` to the `blog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `imageUrl` to the `blog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `blog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "blog" DROP COLUMN "description",
ADD COLUMN     "authorAvatarUrl" TEXT NOT NULL,
ADD COLUMN     "authorDataAiHint" TEXT,
ADD COLUMN     "content" TEXT NOT NULL,
ADD COLUMN     "dataAiHint" TEXT,
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "excerpt" TEXT NOT NULL,
ADD COLUMN     "imageUrl" TEXT NOT NULL,
ADD COLUMN     "slug" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "blog_slug_key" ON "blog"("slug");
