/**
 * Razorpay Type Definitions
 * 
 * Comprehensive TypeScript types for Razorpay integration.
 * These types ensure type safety across the payment flow.
 */

// Order Status enum
export enum RazorpayOrderStatus {
    CREATED = "created",
    ATTEMPTED = "attempted",
    PAID = "paid",
}

// Payment Status enum
export enum RazorpayPaymentStatus {
    CREATED = "created",
    AUTHORIZED = "authorized",
    CAPTURED = "captured",
    REFUNDED = "refunded",
    FAILED = "failed",
}

// Supported Payment Methods
export enum RazorpayPaymentMethod {
    CARD = "card",
    NETBANKING = "netbanking",
    WALLET = "wallet",
    UPI = "upi",
    EMI = "emi",
}

// Currency codes supported by Razorpay
export enum RazorpayCurrency {
    INR = "INR",
    USD = "USD",
    EUR = "EUR",
    GBP = "GBP",
    SGD = "SGD",
    AED = "AED",
}

// Request DTOs
export interface CreatePaymentOrderRequest {
    amount: number; // Amount in rupees (will be converted to paise)
    currency?: RazorpayCurrency;
    planId?: string;
    packageCount?: number;
    notes?: Record<string, string>;
}

export interface VerifyPaymentRequest {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

export interface RefundPaymentRequest {
    paymentId: string;
    amount?: number; // Partial refund amount in paise
    reason?: string;
    notes?: Record<string, string>;
}

// Response DTOs
export interface CreateOrderResponse {
    success: boolean;
    order: {
        id: string;
        amount: number;
        currency: string;
        receipt: string;
    };
    key_id: string; // Razorpay key_id for frontend
    prefill?: {
        name?: string;
        email?: string;
        contact?: string;
    };
}

export interface VerifyPaymentResponse {
    success: boolean;
    message: string;
    payment?: {
        orderId: string;
        paymentId: string;
        amount: number;
        status: string;
    };
}

export interface PaymentStatusResponse {
    success: boolean;
    payment: {
        id: string;
        orderId: string;
        amount: number;
        currency: string;
        status: string;
        method: string;
        captured: boolean;
        createdAt: Date;
    };
}

// Webhook Event Types
export enum RazorpayWebhookEventType {
    PAYMENT_AUTHORIZED = "payment.authorized",
    PAYMENT_CAPTURED = "payment.captured",
    PAYMENT_FAILED = "payment.failed",
    ORDER_PAID = "order.paid",
    REFUND_CREATED = "refund.created",
    REFUND_PROCESSED = "refund.processed",
    REFUND_FAILED = "refund.failed",
}

// Internal Order Creation Data
export interface InternalOrderData {
    userId: string;
    planId?: string;
    packageCount?: number;
    amount: number;
    currency: string;
    razorpayOrderId: string;
    receipt: string;
}

// Internal Payment Data
export interface InternalPaymentData {
    orderId: number;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    amount: number;
    currency: string;
    method?: string;
    status: string;
}

// Error types
export interface RazorpayError {
    code: string;
    description: string;
    source: string;
    step: string;
    reason: string;
    metadata?: Record<string, unknown>;
}
