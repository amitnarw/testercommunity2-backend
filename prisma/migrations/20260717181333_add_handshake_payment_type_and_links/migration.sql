-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "handshakeSubscriptionId" INTEGER,
ADD COLUMN     "paymentType" TEXT NOT NULL DEFAULT 'PRO';

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "handshakeSubscriptionId" INTEGER,
ADD COLUMN     "paymentType" TEXT NOT NULL DEFAULT 'PRO';

-- AlterTable
ALTER TABLE "refund" ADD COLUMN     "handshakeSubscriptionId" INTEGER,
ADD COLUMN     "paymentType" TEXT NOT NULL DEFAULT 'PRO';

-- CreateIndex
CREATE INDEX "payment_paymentType_idx" ON "payment"("paymentType");

-- CreateIndex
CREATE INDEX "payment_handshakeSubscriptionId_idx" ON "payment"("handshakeSubscriptionId");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_handshakeSubscriptionId_fkey" FOREIGN KEY ("handshakeSubscriptionId") REFERENCES "handshake_subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_handshakeSubscriptionId_fkey" FOREIGN KEY ("handshakeSubscriptionId") REFERENCES "handshake_subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_handshakeSubscriptionId_fkey" FOREIGN KEY ("handshakeSubscriptionId") REFERENCES "handshake_subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
