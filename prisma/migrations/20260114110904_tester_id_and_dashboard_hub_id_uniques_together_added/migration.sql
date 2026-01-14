/*
  Warnings:

  - A unique constraint covering the columns `[testerId,dashboardAndHubId]` on the table `tester_relation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "tester_relation_testerId_dashboardAndHubId_key" ON "tester_relation"("testerId", "dashboardAndHubId");
