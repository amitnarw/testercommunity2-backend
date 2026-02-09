/**
 * Razorpay SDK Configuration
 * 
 * This module initializes the Razorpay instance with API credentials
 * and exports utility functions for payment processing.
 * 
 * Best Practices Implemented:
 * 1. Environment-based configuration
 * 2. Singleton pattern for Razorpay instance
 * 3. Type safety with TypeScript
 * 4. Centralized configuration management
 */

import Razorpay from "razorpay";
import crypto from "crypto";

// Validate required environment variables
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.warn(
    "⚠️ Razorpay credentials not configured. Payment features will be disabled."
  );
}

// Initialize Razorpay instance
const razorpayInstance = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
  ? new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    })
  : null;

/**
 * Get the Razorpay instance
 * @throws Error if Razorpay is not configured
 */
export const getRazorpayInstance = (): Razorpay => {
  if (!razorpayInstance) {
    throw new Error("Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.");
  }
  return razorpayInstance;
};

/**
 * Verify the Razorpay payment signature
 * This is critical for security - ensures payment is authentic
 * 
 * @param orderId - Razorpay order ID
 * @param paymentId - Razorpay payment ID
 * @param signature - Signature received from checkout
 * @returns boolean indicating if signature is valid
 */
export const verifyPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string
): boolean => {
  if (!RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay key secret not configured");
  }

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
};

/**
 * Verify Razorpay webhook signature
 * Ensures webhook payloads are from Razorpay
 * 
 * @param body - Raw request body (string)
 * @param signature - X-Razorpay-Signature header value
 * @param secret - Webhook secret from Razorpay dashboard
 * @returns boolean indicating if signature is valid
 */
export const verifyWebhookSignature = (
  body: string,
  signature: string,
  secret: string
): boolean => {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
};

/**
 * Get the Razorpay key ID for frontend usage
 * Only the key_id should be exposed to the frontend
 */
export const getRazorpayKeyId = (): string => {
  if (!RAZORPAY_KEY_ID) {
    throw new Error("Razorpay key ID not configured");
  }
  return RAZORPAY_KEY_ID;
};

/**
 * Check if Razorpay is properly configured
 */
export const isRazorpayConfigured = (): boolean => {
  return !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
};

// Razorpay order creation options interface
export interface CreateOrderOptions {
  amount: number; // Amount in paise (smallest currency unit)
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
  partial_payment?: boolean;
}

// Razorpay order response interface
export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
}

// Payment verification data interface
export interface PaymentVerificationData {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

// Webhook event interface
export interface RazorpayWebhookEvent {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    order?: {
      entity: RazorpayOrder;
    };
  };
  created_at: number;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  invoice_id: string | null;
  international: boolean;
  method: string;
  amount_refunded: number;
  refund_status: string | null;
  captured: boolean;
  description: string;
  card_id: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  email: string;
  contact: string;
  fee: number;
  tax: number;
  error_code: string | null;
  error_description: string | null;
  error_source: string | null;
  error_step: string | null;
  error_reason: string | null;
  notes: Record<string, string>;
  created_at: number;
}

export default razorpayInstance;
