-- CreateIndex
CREATE INDEX "dashboard_and_hub_appType_status_idx" ON "dashboard_and_hub"("appType", "status");

-- CreateIndex
CREATE INDEX "handshake_link_status_idx" ON "handshake_link"("status");
