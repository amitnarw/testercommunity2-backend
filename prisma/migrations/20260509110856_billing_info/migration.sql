/*
  Warnings:

  - A unique constraint covering the columns `[invoiceId]` on the table `order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "dashboard_and_hub" ADD COLUMN     "activeTestersOverride" INTEGER,
ADD COLUMN     "bugCountOverride" INTEGER,
ADD COLUMN     "completedTestersOverride" INTEGER,
ADD COLUMN     "pendingTestersOverride" INTEGER,
ADD COLUMN     "praiseCountOverride" INTEGER,
ADD COLUMN     "suggestionCountOverride" INTEGER;

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "billing_info" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "gstin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_info_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_info_userId_key" ON "billing_info"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "order_invoiceId_key" ON "order"("invoiceId");

-- AddForeignKey
ALTER TABLE "billing_info" ADD CONSTRAINT "billing_info_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
