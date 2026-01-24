/*
  Warnings:

  - A unique constraint covering the columns `[feedbackId]` on the table `media` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "media_feedbackId_key" ON "media"("feedbackId");
