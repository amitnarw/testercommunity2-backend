ALTER TABLE user_transactions ADD COLUMN IF NOT EXISTS "razorpayPaymentId" TEXT;
CREATE INDEX IF NOT EXISTS user_transactions_razorpay_payment_id_idx ON user_transactions ("razorpayPaymentId");
