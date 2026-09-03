-- CreateTable
CREATE TABLE "elite_badge_audit_log" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elite_badge_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "elite_badge_audit_log_userId_idx" ON "elite_badge_audit_log"("userId");

-- CreateIndex
CREATE INDEX "elite_badge_audit_log_adminId_idx" ON "elite_badge_audit_log"("adminId");

-- CreateIndex
CREATE INDEX "elite_badge_audit_log_createdAt_idx" ON "elite_badge_audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "elite_badge_audit_log_action_idx" ON "elite_badge_audit_log"("action");

-- AddForeignKey
ALTER TABLE "elite_badge_audit_log" ADD CONSTRAINT "elite_badge_audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elite_badge_audit_log" ADD CONSTRAINT "elite_badge_audit_log_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
