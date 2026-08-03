ALTER TABLE payment ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS "paymentType" TEXT DEFAULT 'ONE_TIME' NOT NULL;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS "handshakeSubscriptionId" INTEGER;
CREATE INDEX IF NOT EXISTS payment_handshake_subscription_id_idx ON payment ("handshakeSubscriptionId");
