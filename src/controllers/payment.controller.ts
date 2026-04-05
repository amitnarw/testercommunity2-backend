import logger from "../utils/logger";
/**
 * Payment Controller - Razorpay Integration
 * 
 * Handles all payment-related operations including:
 * - Order creation
 * - Payment verification
 * - Payment status checking
 * - Webhook processing
 * - Refund handling
 * 
 * Best Practices Implemented:
 * 1. Signature verification for security
 * 2. Idempotency for webhook processing
 * 3. Comprehensive error handling
 * 4. Audit logging for all payment operations
 * 5. Transaction-safe database operations
 */

/**
 * Payment Controller - Razorpay Integration
 *
 * Handles all payment-related operations including:
 * - Order creation
 * - Payment verification
 * - Payment status checking
 * - Webhook processing
 * - Refund handling
 *
 * Best Practices Implemented:
 * 1. Signature verification for security
 * 2. Idempotency for webhook processing
 * 3. Comprehensive error handling
 * 4. Audit logging for all payment operations
 * 5. Transaction-safe database operations
 */
import type { Request, Response } from "express";
import {
    getRazorpayInstance,
    getRazorpayKeyId,
    isRazorpayConfigured,
    verifyPaymentSignature,
    verifyWebhookSignature,
    type RazorpayOrder,
    type RazorpayWebhookEvent,
    type RazorpayPaymentEntity,
} from "../lib/razorpay";
import { sendSuccess, sendError } from "../utils/response";
import { v4 as uuidv4 } from "uuid";
import type {
    CreatePaymentOrderRequest,
    VerifyPaymentRequest,
} from "../types/razorpay.types";
import { prismaClient } from "@/lib/prisma";

// Environment variables
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

/**
 * Get Razorpay configuration for frontend
 * Returns the key_id needed for checkout initialization
 */
export const getConfig = async (_req: Request, res: Response) => {
    try {
        if (!isRazorpayConfigured()) {
            return sendError(res, 503, "Payment gateway not configured");
        }

        return sendSuccess(res, {
            key_id: getRazorpayKeyId(),
            currency: "INR",
            name: "Tester Community",
            description: "Tester Community Payment Gateway",
        });
    } catch (error) {
        logger.error("Error getting payment config:", error);
        return sendError(res, 500, "Failed to get payment configuration");
    }
};

/**
 * Create a new Razorpay order
 * This is the first step in the payment flow
 */
export const createOrder = async (req: Request, res: Response) => {
    try {
        if (!isRazorpayConfigured()) {
            return sendError(res, 503, "Payment gateway not configured");
        }

        const userId = (req as any).userId;
        if (!userId) {
            return sendError(res, 401, "User not authenticated");
        }

        const { amount, currency = "INR", planId, packageCount = 1, notes } = req.body as CreatePaymentOrderRequest;

        // Validate amount
        if (!amount || amount <= 0) {
            return sendError(res, 400, "Invalid amount");
        }

        // Validate plan if provided
        if (planId) {
            const plan = await prismaClient?.plans.findUnique({
                where: { id: planId },
            });

            if (!plan || !plan.isActive) {
                return sendError(res, 400, "Invalid or inactive plan");
            }
        }

        // Generate unique receipt ID
        const receipt = `rcpt_${uuidv4().replace(/-/g, "").substring(0, 20)}`;

        // Convert amount to paise (smallest currency unit)
        const amountInPaise = Math.round(amount * 100);

        // Create order in Razorpay
        const razorpay = getRazorpayInstance();
        const razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency,
            receipt,
            notes: {
                userId,
                planId: planId || "",
                packageCount: String(packageCount),
                ...notes,
            },
        }) as RazorpayOrder;

        // Store order in database
        const order = await prismaClient?.order.create({
            data: {
                userId,
                planId: planId || null,
                packageCount,
                razorpayOrderId: razorpayOrder.id,
                receipt,
                amount: amountInPaise,
                currency,
                status: "CREATED",
                notes: notes as any,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiry
            },
        });

        // Get user details for prefill
        const user = await prismaClient?.user.findUnique({
            where: { id: userId },
            include: {
                userDetail: true,
            },
        });

        return sendSuccess(res, {
            order: {
                id: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                receipt: razorpayOrder.receipt,
                internalOrderId: order.id,
            },
            key_id: getRazorpayKeyId(),
            prefill: {
                name: user?.name || "",
                email: user?.email || "",
                contact: user?.userDetail?.phone || "",
            },
        }, "Order created successfully");
    } catch (error: any) {
        logger.error("Error creating order:", error);
        return sendError(
            res,
            error.message || "Failed to create order",
            error.statusCode || 500
        );
    }
};

/**
 * Verify payment after checkout completion
 * This validates the payment signature and updates the order status
 */
export const verifyPayment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return sendError(res, 401, "User not authenticated");
        }

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body as VerifyPaymentRequest;

        // Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return sendError(res, 400, "Missing required payment verification fields");
        }

        // Verify signature
        const isValid = verifyPaymentSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isValid) {
            logger.error("Payment signature verification failed:", {
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
            });
            return sendError(res, 400, "Payment verification failed - invalid signature");
        }

        // Find the order
        const order = await prismaClient?.order.findUnique({
            where: { razorpayOrderId: razorpay_order_id },
        });

        if (!order) {
            return sendError(res, 404, "Order not found");
        }

        // Check if user owns this order
        if (order.userId !== userId) {
            return sendError(res, 403, "Unauthorized access to this order");
        }

        // Fetch payment details from Razorpay
        const razorpay = getRazorpayInstance();
        const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id) as RazorpayPaymentEntity;

        // Use transaction for consistency
        const result = await prismaClient?.$transaction(async (tx) => {
            // Check for duplicate payment (idempotency)
            const existingPayment = await tx.payment.findUnique({
                where: { razorpayPaymentId: razorpay_payment_id },
            });

            if (existingPayment) {
                return { payment: existingPayment, order, isNew: false };
            }

            // Create payment record
            const payment = await tx.payment.create({
                data: {
                    orderId: order.id,
                    razorpayPaymentId: razorpay_payment_id,
                    razorpayOrderId: razorpay_order_id,
                    razorpaySignature: razorpay_signature,
                    amount: paymentDetails.amount,
                    currency: paymentDetails.currency,
                    status: paymentDetails.status === "captured" ? "CAPTURED" :
                        paymentDetails.status === "authorized" ? "AUTHORIZED" : "PENDING",
                    method: paymentDetails.method,
                    bank: paymentDetails.bank,
                    wallet: paymentDetails.wallet,
                    vpa: paymentDetails.vpa,
                    email: paymentDetails.email,
                    contact: paymentDetails.contact,
                    fee: paymentDetails.fee,
                    tax: paymentDetails.tax,
                    captured: paymentDetails.captured,
                    international: paymentDetails.international,
                    notes: paymentDetails.notes as any,
                },
            });

            // Update order status
            await tx.order.update({
                where: { id: order.id },
                data: {
                    status: "PAID",
                    attempts: { increment: 1 },
                },
            });

            // If plan purchase, update user's plan
            if (order.planId) {
                await tx.userPlan.create({
                    data: {
                        userId: order.userId,
                        planId: order.planId,
                        isActive: true,
                    },
                });

                // Update user wallet with packages
                const plan = await tx.plans.findUnique({
                    where: { id: order.planId },
                });

                if (plan && order.packageCount) {
                    await tx.userWallet.upsert({
                        where: { userId: order.userId },
                        create: {
                            userId: order.userId,
                            totalPackages: plan.package * order.packageCount,
                        },
                        update: {
                            totalPackages: {
                                increment: plan.package * order.packageCount,
                            },
                        },
                    });

                    // Record transaction
                    await tx.userTransaction.create({
                        data: {
                            userId: order.userId,
                            package: plan.package * order.packageCount,
                            transactionType: "PURCHASE",
                            status: "CREDIT",
                        },
                    });
                }
            }

            return { payment, order, isNew: true };
        });

        return sendSuccess(res, {
            verified: true,
            payment: {
                id: result.payment.id,
                orderId: result.payment.razorpayOrderId,
                paymentId: result.payment.razorpayPaymentId,
                amount: result.payment.amount / 100, // Convert back to rupees
                currency: result.payment.currency,
                status: result.payment.status,
            },
            isNew: result.isNew,
        }, "Payment verified successfully");
    } catch (error: any) {
        logger.error("Error verifying payment:", error);
        return sendError(
            res,
            error.message || "Payment verification failed",
            error.statusCode || 500
        );
    }
};

/**
 * Get payment status by order ID
 */
export const getPaymentStatus = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return sendError(res, 401, "User not authenticated");
        }

        const { orderId } = req.params;

        const search = (req.query.search as string) || "";
        const status = (req.query.status as string) || "All";

        const where: any = { userId };
        if (search) {
            where.OR = [
                { razorpayOrderId: { contains: search, mode: "insensitive" } },
                { receipt: { contains: search, mode: "insensitive" } },
            ];
        }
        if (status !== "All") {
            where.status = status;
        }

        const order = await prismaClient?.order.findFirst({
            where: {
                OR: [
                    { razorpayOrderId: orderId as string },
                    { id: parseInt(orderId as string) || 0 },
                ],
                userId: userId as string,
            },
            include: {
                payments: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
            },
        });

        if (!order) {
            return sendError(res, 404, "Order not found");
        }

        const latestPayment = (order as any).payments?.[0];

        return sendSuccess(res, {
            order: {
                id: order.id,
                razorpayOrderId: order.razorpayOrderId,
                amount: order.amount / 100,
                currency: order.currency,
                status: order.status,
                createdAt: order.createdAt,
            },
            payment: latestPayment ? {
                id: latestPayment.id,
                razorpayPaymentId: latestPayment.razorpayPaymentId,
                status: latestPayment.status,
                method: latestPayment.method,
                captured: latestPayment.captured,
                createdAt: latestPayment.createdAt,
            } : null,
        });
    } catch (error: any) {
        logger.error("Error getting payment status:", error);
        return sendError(res, 500, "Failed to get payment status");
    }
};

/**
 * Get user's payment history
 */
export const getPaymentHistory = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return sendError(res, 401, "User not authenticated");
        }

        const { page = 1, limit = 10 } = req.query;
        const appType = req.query.appType ?? "ALL";
        const status = req.query.status ?? "All";
        const search = req.query.search ?? "";
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = {
            userId,
            appType: appType !== "ALL" ? (appType as string) : undefined,
            status: status !== "All" ? (status as string) : undefined,
        };

        if (search) {
            where.OR = [
                {
                    androidApp: {
                        appName: { contains: search as string, mode: "insensitive" },
                    },
                },
                {
                    appOwner: {
                        name: { contains: search as string, mode: "insensitive" },
                    },
                },
            ];
        }

        const [orders, total] = await Promise.all([
            prismaClient?.order.findMany({
                where,
                include: {
                    payments: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                    },
                    plan: {
                        select: {
                            name: true,
                            price: true,
                            package: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: Number(limit),
            }),
            prismaClient?.order.count({ where: { userId } }),
        ]);

        return sendSuccess(res, {
            orders: orders.map((order) => ({
                id: order.id,
                razorpayOrderId: order.razorpayOrderId,
                amount: order.amount / 100,
                currency: order.currency,
                status: order.status,
                plan: order.plan,
                packageCount: order.packageCount,
                payment: order.payments[0] ? {
                    status: order.payments[0].status,
                    method: order.payments[0].method,
                    createdAt: order.payments[0].createdAt,
                } : null,
                createdAt: order.createdAt,
            })),
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error: any) {
        logger.error("Error getting payment history:", error);
        return sendError(res, 500, "Failed to get payment history");
    }
};

/**
 * Handle Razorpay webhooks
 * This endpoint receives events from Razorpay for async payment updates
 */
export const handleWebhook = async (req: Request, res: Response) => {
    try {
        // Get raw body for signature verification
        const rawBody = JSON.stringify(req.body);
        const signature = req.headers["x-razorpay-signature"] as string;

        if (!signature) {
            logger.error("Webhook: Missing signature header");
            return res.status(400).json({ error: "Missing signature" });
        }

        // Verify webhook signature
        if (!verifyWebhookSignature(rawBody, signature, RAZORPAY_WEBHOOK_SECRET)) {
            logger.error("Webhook: Invalid signature");
            return res.status(400).json({ error: "Invalid signature" });
        }

        const event = req.body as RazorpayWebhookEvent;
        const eventId = `${event.event}_${event.created_at}`;

        // Check for duplicate event (idempotency)
        const existingEvent = await prismaClient?.webhookEventLog.findUnique({
            where: { eventId },
        });

        if (existingEvent?.processed) {
            logger.info(`Webhook: Duplicate event ${eventId}, skipping`);
            return res.status(200).json({ status: "already_processed" });
        }

        // Log the event
        const webhookLog = await prismaClient?.webhookEventLog.upsert({
            where: { eventId },
            create: {
                eventId,
                eventType: event.event,
                payload: event as any,
            },
            update: {},
        });

        // Process the event
        try {
            await processWebhookEvent(event);

            // Mark as processed
            await prismaClient?.webhookEventLog.update({
                where: { id: webhookLog.id },
                data: {
                    processed: true,
                    processedAt: new Date(),
                },
            });

            return res.status(200).json({ status: "processed" });
        } catch (processingError: any) {
            // Log error but still return 200 to prevent retries for permanent failures
            await prismaClient?.webhookEventLog.update({
                where: { id: webhookLog.id },
                data: {
                    processingError: processingError.message,
                },
            });

            logger.error("Webhook processing error:", processingError);
            return res.status(200).json({ status: "processing_error" });
        }
    } catch (error: any) {
        logger.error("Webhook handler error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Process individual webhook events
 */
async function processWebhookEvent(event: RazorpayWebhookEvent): Promise<void> {
    const eventType = event.event;

    switch (eventType) {
        case "payment.authorized":
            await handlePaymentAuthorized(event);
            break;

        case "payment.captured":
            await handlePaymentCaptured(event);
            break;

        case "payment.failed":
            await handlePaymentFailed(event);
            break;

        case "order.paid":
            await handleOrderPaid(event);
            break;

        case "refund.created":
        case "refund.processed":
            await handleRefundEvent(event);
            break;

        default:
            logger.info(`Webhook: Unhandled event type: ${eventType}`);
    }
}

/**
 * Handle payment.authorized event
 */
async function handlePaymentAuthorized(event: RazorpayWebhookEvent): Promise<void> {
    const payment = event.payload.payment?.entity;
    if (!payment) return;

    await prismaClient?.payment.upsert({
        where: { razorpayPaymentId: payment.id },
        create: {
            orderId: (await getOrderIdFromRazorpayOrderId(payment.order_id)) || 0,
            razorpayPaymentId: payment.id,
            razorpayOrderId: payment.order_id,
            amount: payment.amount,
            currency: payment.currency,
            status: "AUTHORIZED",
            method: payment.method,
            bank: payment.bank,
            wallet: payment.wallet,
            vpa: payment.vpa,
            email: payment.email,
            contact: payment.contact,
            webhookVerified: true,
            webhookPayload: event as any,
        },
        update: {
            status: "AUTHORIZED",
            webhookVerified: true,
            webhookPayload: event as any,
        },
    });
}

/**
 * Handle payment.captured event
 */
async function handlePaymentCaptured(event: RazorpayWebhookEvent): Promise<void> {
    const payment = event.payload.payment?.entity;
    if (!payment) return;

    await prismaClient?.$transaction(async (tx) => {
        // Update payment status
        await tx.payment.upsert({
            where: { razorpayPaymentId: payment.id },
            create: {
                orderId: (await getOrderIdFromRazorpayOrderId(payment.order_id)) || 0,
                razorpayPaymentId: payment.id,
                razorpayOrderId: payment.order_id,
                amount: payment.amount,
                currency: payment.currency,
                status: "CAPTURED",
                method: payment.method,
                bank: payment.bank,
                wallet: payment.wallet,
                vpa: payment.vpa,
                email: payment.email,
                contact: payment.contact,
                fee: payment.fee,
                tax: payment.tax,
                captured: true,
                webhookVerified: true,
                webhookPayload: event as any,
            },
            update: {
                status: "CAPTURED",
                captured: true,
                fee: payment.fee,
                tax: payment.tax,
                webhookVerified: true,
                webhookPayload: event as any,
            },
        });

        // Update order status
        await tx.order.updateMany({
            where: { razorpayOrderId: payment.order_id },
            data: { status: "PAID" },
        });
    });
}

/**
 * Handle payment.failed event
 */
async function handlePaymentFailed(event: RazorpayWebhookEvent): Promise<void> {
    const payment = event.payload.payment?.entity;
    if (!payment) return;

    await prismaClient?.payment.upsert({
        where: { razorpayPaymentId: payment.id },
        create: {
            orderId: (await getOrderIdFromRazorpayOrderId(payment.order_id)) || 0,
            razorpayPaymentId: payment.id,
            razorpayOrderId: payment.order_id,
            amount: payment.amount,
            currency: payment.currency,
            status: "FAILED",
            method: payment.method,
            errorCode: payment.error_code,
            errorDescription: payment.error_description,
            errorReason: payment.error_reason,
            webhookVerified: true,
            webhookPayload: event as any,
        },
        update: {
            status: "FAILED",
            errorCode: payment.error_code,
            errorDescription: payment.error_description,
            errorReason: payment.error_reason,
            webhookVerified: true,
            webhookPayload: event as any,
        },
    });
}

/**
 * Handle order.paid event
 */
async function handleOrderPaid(event: RazorpayWebhookEvent): Promise<void> {
    const order = event.payload.order?.entity;
    if (!order) return;

    await prismaClient?.order.updateMany({
        where: { razorpayOrderId: order.id },
        data: { status: "PAID" },
    });
}

/**
 * Handle refund events
 */
async function handleRefundEvent(event: RazorpayWebhookEvent): Promise<void> {
    // Refund handling would go here
    // Implementation depends on your refund processing requirements
    logger.info("Refund event received:", event.event);
}

/**
 * Helper to get internal order ID from Razorpay order ID
 */
async function getOrderIdFromRazorpayOrderId(razorpayOrderId: string): Promise<number | null> {
    const order = await prismaClient?.order.findUnique({
        where: { razorpayOrderId },
        select: { id: true },
    });
    return order?.id || null;
}

/**
 * Initiate refund for a payment
 */
export const initiateRefund = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return sendError(res, 401, "User not authenticated");
        }

        const { paymentId, amount, reason } = req.body;

        if (!paymentId) {
            return sendError(res, 400, "Payment ID is required");
        }

        // Find the payment
        const payment = await prismaClient?.payment.findUnique({
            where: { razorpayPaymentId: paymentId },
            include: {
                order: true,
            },
        });

        if (!payment) {
            return sendError(res, 404, "Payment not found");
        }

        // Verify user ownership (admins can refund any payment)
        const userDetail = await prismaClient?.userDetail.findUnique({
            where: { userId },
            include: { role: true },
        });

        if (payment.order.userId !== userId && userDetail?.role?.name !== "admin") {
            return sendError(res, 403, "Unauthorized");
        }

        if (payment.status !== "CAPTURED") {
            return sendError(res, 400, "Only captured payments can be refunded");
        }

        // Calculate refund amount
        const refundAmount = amount ? Math.round(amount * 100) : payment.amount;

        if (refundAmount > payment.amount - payment.amountRefunded) {
            return sendError(res, 400, "Refund amount exceeds available balance");
        }

        // Create refund in Razorpay
        const razorpay = getRazorpayInstance();
        const razorpayRefund = await razorpay.payments.refund(paymentId, {
            amount: refundAmount,
            notes: { reason: reason || "Customer request" },
        }) as any;

        // Create refund record
        const refund = await prismaClient?.refund.create({
            data: {
                paymentId: payment.id,
                razorpayRefundId: razorpayRefund.id,
                razorpayPaymentId: paymentId,
                amount: refundAmount,
                currency: payment.currency,
                reason: reason || "Customer request",
                status: "PENDING",
            },
        });

        // Update payment refund status
        const newRefundedAmount = payment.amountRefunded + refundAmount;
        await prismaClient?.payment.update({
            where: { id: payment.id },
            data: {
                amountRefunded: newRefundedAmount,
                refundStatus: newRefundedAmount >= payment.amount ? "FULL" : "PARTIAL",
                status: newRefundedAmount >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED",
            },
        });

        return sendSuccess(res, {
            refund: {
                id: refund.id,
                razorpayRefundId: refund.razorpayRefundId,
                amount: refund.amount / 100,
                status: refund.status,
            },
        }, "Refund initiated successfully");
    } catch (error: any) {
        logger.error("Error initiating refund:", error);
        return sendError(res, 500, error.message || "Failed to initiate refund");
    }
};
