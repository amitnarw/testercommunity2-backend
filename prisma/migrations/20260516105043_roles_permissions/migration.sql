/*
  Warnings:

  - A unique constraint covering the columns `[roleId,moduleId]` on the table `permission` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "permission_roleId_moduleId_key" ON "permission"("roleId", "moduleId");
