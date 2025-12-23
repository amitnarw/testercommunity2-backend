/*
  Warnings:

  - Added the required column `isActive` to the `notification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "dashboard_and_hub" ALTER COLUMN "currentTester" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "isActive" BOOLEAN NOT NULL;
