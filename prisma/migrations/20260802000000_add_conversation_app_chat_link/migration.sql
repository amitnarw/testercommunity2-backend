-- AlterTable
ALTER TABLE "conversation" ADD COLUMN "dashboardAndHubId" INTEGER;

-- CreateIndex
CREATE INDEX "conversation_dashboardAndHubId_idx" ON "conversation"("dashboardAndHubId");

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
