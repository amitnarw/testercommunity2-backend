import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";
import { type Request, type Response } from "express";
import logger from "../utils/logger";
import {
  amountToWords,
  getNextInvoiceNumber,
  calculateTax,
  determineInvoiceType,
  formatPeriod,
  getStateCodeFromName,
  COMPANY_DETAILS,
} from "@/utils/invoice.utils";

const qs = (val: any): string | undefined =>
  typeof val === "string" ? val : undefined;

export const getFinanceDashboard = async (req: Request, res: Response) => {
  try {

    const totalRevenue = await prismaClient.payment.aggregate({
      _sum: { amount: true },
      where: { status: "CAPTURED" },
    });

    const ordersByStatus = await prismaClient.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const totalPackagesSold = await prismaClient.userWallet.aggregate({
      _sum: { totalPackages: true },
    });

    const totalPointsDistributed = await prismaClient.userWallet.aggregate({
      _sum: { totalPoints: true },
    });

    const totalTesterEarnings = await prismaClient.userWallet.aggregate({
      _sum: { balanceMoney: true },
    });

    const pendingWithdrawals = await prismaClient.withdrawalRequest.findMany({
      where: { status: "PENDING" },
    });

    const refunds = await prismaClient.refund.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amount: true },
    });

    const totalPayments = await prismaClient.payment.count();
    const capturedPayments = await prismaClient.payment.count({
      where: { status: "CAPTURED" },
    });

    const totalOrders = await prismaClient.order.count();
    const paidOrders = await prismaClient.order.count({
      where: { status: "PAID" },
    });

    const totalInvoices = await prismaClient.invoice.count();
    const totalRefunds = await prismaClient.refund.count();

    const pendingWithdrawalsAmount = pendingWithdrawals.reduce(
      (sum, w) => sum + w.amount,
      0,
    );
    const pendingWithdrawalsCount = pendingWithdrawals.length;

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlyRevenue = await prismaClient.payment.findMany({
      where: {
        status: "CAPTURED",
        createdAt: { gte: twelveMonthsAgo },
      },
      select: { amount: true, amount_inr: true, currency: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const monthlyRevenueMap: Record<string, { revenue: number; count: number }> = {};
    for (const p of monthlyRevenue) {
      const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyRevenueMap[key]) {
        monthlyRevenueMap[key] = { revenue: 0, count: 0 };
      }
      const amount = p.amount_inr || (p.currency === "INR" ? p.amount : p.amount * 83);
      monthlyRevenueMap[key].revenue += amount / 100;
      monthlyRevenueMap[key].count += 1;
    }

    const monthlyRevenueTrend = Object.entries(monthlyRevenueMap).map(
      ([month, data]) => ({
        month,
        revenue: Math.round(data.revenue * 100) / 100,
        count: data.count,
      }),
    );

    return sendSuccess(res, {
      totalRevenue: totalRevenue._sum.amount || 0,
      totalOrders,
      paidOrders,
      totalPayments,
      capturedPayments,
      totalInvoices,
      totalRefunds,
      ordersByStatus: ordersByStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count._all;
          return acc;
        },
        {} as Record<string, number>,
      ),
      packagesSold: Math.floor(totalPackagesSold._sum.totalPackages || 0),
      pointsDistributed: Math.floor(totalPointsDistributed._sum.totalPoints || 0),
      testerEarnings: Math.floor(totalTesterEarnings._sum.balanceMoney || 0),
      pendingWithdrawalsCount,
      pendingWithdrawalsAmount: Math.round(pendingWithdrawalsAmount * 100) / 100,
      refundsByStatus: refunds.reduce(
        (acc, item) => {
          acc[item.status] = {
            count: item._count._all,
            amount: item._sum.amount || 0,
          };
          return acc;
        },
        {} as Record<string, { count: number; amount: number }>,
      ),
      monthlyRevenue: monthlyRevenueTrend,
    });
  } catch (error) {
    logger.error("Error in getFinanceDashboard:", error);
    return sendError(res, 500, "Failed to fetch finance dashboard data");
  }
};

export const getFinanceOrders = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(qs(req.query.page) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(qs(req.query.limit) || "20")));
    const skip = (page - 1) * limit;
    const status = qs(req.query.status);
    const search = qs(req.query.search);

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { razorpayOrderId: { contains: search, mode: "insensitive" } },
        { receipt: { contains: search, mode: "insensitive" } },
        { invoiceId: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prismaClient.order.findMany({
        where,
        include: {
          plan: { select: { name: true, package: true } },
          user: { select: { id: true, name: true, email: true, image: true } },
          payments: {
            select: { id: true, razorpayPaymentId: true, amount: true, status: true, method: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prismaClient.order.count({ where }),
    ]);

    return sendSuccess(res, {
      orders: orders.map((o) => ({
        id: o.id,
        razorpayOrderId: o.razorpayOrderId,
        receipt: o.receipt,
        amount: o.amount,
        currency: o.currency,
        status: o.status,
        invoiceId: o.invoiceId,
        packageCount: o.packageCount,
        plan: o.plan ? { name: o.plan.name, package: o.plan.package } : null,
        user: o.user,
        payment: o.payments[0] || null,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("Error in getFinanceOrders:", error);
    return sendError(res, 500, "Failed to fetch orders");
  }
};

export const getFinancePayments = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(qs(req.query.page) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(qs(req.query.limit) || "20")));
    const skip = (page - 1) * limit;
    const status = qs(req.query.status);
    const method = qs(req.query.method);
    const search = qs(req.query.search);

    const where: any = {};
    if (status) where.status = status;
    if (method) where.method = method;
    if (search) {
      where.OR = [
        { razorpayPaymentId: { contains: search, mode: "insensitive" } },
        { razorpayOrderId: { contains: search, mode: "insensitive" } },
        { customer_name: { contains: search, mode: "insensitive" } },
        { customer_email: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [payments, total] = await Promise.all([
      prismaClient.payment.findMany({
        where,
        include: {
          order: {
            select: { id: true, razorpayOrderId: true, amount: true, status: true, invoiceId: true },
          },
          user: { select: { id: true, name: true, email: true, image: true } },
          refunds: { select: { id: true, amount: true, status: true, reason: true } },
          invoice: { select: { id: true, invoice_number: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prismaClient.payment.count({ where }),
    ]);

    return sendSuccess(res, {
      payments: payments.map((p) => ({
        id: p.id,
        razorpayPaymentId: p.razorpayPaymentId,
        razorpayOrderId: p.razorpayOrderId,
        amount: p.amount,
        amount_inr: p.amount_inr,
        currency: p.currency,
        status: p.status,
        method: p.method,
        bank: p.bank,
        fee: p.fee,
        tax: p.tax,
        amountRefunded: p.amountRefunded,
        refundStatus: p.refundStatus,
        captured: p.captured,
        customer_name: p.customer_name,
        customer_email: p.customer_email,
        order: p.order,
        user: p.user,
        refunds: p.refunds,
        invoice: p.invoice,
        createdAt: p.createdAt.toISOString(),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("Error in getFinancePayments:", error);
    return sendError(res, 500, "Failed to fetch payments");
  }
};

export const getFinanceInvoices = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(qs(req.query.page) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(qs(req.query.limit) || "20")));
    const skip = (page - 1) * limit;
    const search = qs(req.query.search);

    const where: any = {};
    if (search) {
      where.OR = [
        { invoice_number: { contains: search, mode: "insensitive" } },
        { service_name: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prismaClient.invoice.findMany({
        where,
        include: {
          payment: {
            select: {
              id: true,
              razorpayPaymentId: true,
              amount: true,
              currency: true,
              status: true,
              method: true,
              createdAt: true,
            },
          },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prismaClient.invoice.count({ where }),
    ]);

    return sendSuccess(res, {
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        service_name: inv.service_name,
        user: inv.user,
        payment: inv.payment,
        createdAt: inv.createdAt.toISOString(),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("Error in getFinanceInvoices:", error);
    return sendError(res, 500, "Failed to fetch invoices");
  }
};

export const getUserInvoices = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    if (!userId) return sendError(res, 400, "User ID is required");

    const page = Math.max(1, parseInt(qs(req.query.page) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(qs(req.query.limit) || "20")));
    const skip = (page - 1) * limit;

    const where: any = { userId };

    const [invoices, total] = await Promise.all([
      prismaClient.invoice.findMany({
        where,
        include: {
          payment: {
            select: {
              id: true,
              razorpayPaymentId: true,
              amount: true,
              currency: true,
              status: true,
              method: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prismaClient.invoice.count({ where }),
    ]);

    return sendSuccess(res, {
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_type: inv.invoice_type,
        service_name: inv.service_name,
        sac_code: inv.sac_code,
        period: inv.period,
        quantity: inv.quantity,
        unit_price: inv.unit_price,
        tax_rate: inv.tax_rate,
        cgst_amount: inv.cgst_amount,
        sgst_amount: inv.sgst_amount,
        igst_amount: inv.igst_amount,
        state_code: inv.state_code,
        due_date: inv.due_date?.toISOString() || null,
        place_of_supply: inv.place_of_supply,
        supply_type: inv.supply_type,
        amount_in_words: inv.amount_in_words,
        lut_number: inv.lut_number,
        payment: inv.payment,
        createdAt: inv.createdAt.toISOString(),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("Error in getUserInvoices:", error);
    return sendError(res, 500, "Failed to fetch user invoices");
  }
};

export const updateInvoice = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    if (!payload || !payload.id) {
      return sendError(res, 400, "Invoice ID is required");
    }

    const existing = await prismaClient.invoice.findUnique({
      where: { id: payload.id },
      include: {
        payment: { select: { id: true, amount: true, currency: true } },
      },
    });

    if (!existing) {
      return sendError(res, 404, "Invoice not found");
    }

    const allowedFields = [
      "invoice_number", "service_name", "period", "quantity", "unit_price",
      "tax_rate", "cgst_amount", "sgst_amount", "igst_amount",
      "state_code", "due_date", "place_of_supply", "supply_type",
      "amount_in_words", "lut_number", "sac_code",
    ];

    const updateData: any = {};
    let shouldRecalcWords = false;

    if (payload.invoice_number !== undefined && payload.invoice_number !== existing.invoice_number) {
      const duplicate = await prismaClient.invoice.findUnique({
        where: { invoice_number: payload.invoice_number },
      });
      if (duplicate) {
        return sendError(res, 409, "Invoice number already in use.");
      }
    }

    for (const field of allowedFields) {
      if (payload[field] !== undefined) {
        if (field === "due_date" && payload[field]) {
          updateData[field] = new Date(payload[field]);
        } else {
          updateData[field] = payload[field];
        }
        if (["quantity", "unit_price", "tax_rate", "cgst_amount", "sgst_amount", "igst_amount"].includes(field)) {
          shouldRecalcWords = true;
        }
      }
    }

    if (shouldRecalcWords && !payload.amount_in_words) {
      const unitPrice = updateData.unit_price ?? existing.unit_price ?? 0;
      const quantity = updateData.quantity ?? existing.quantity ?? 1;
      const totalWithoutTax = unitPrice * quantity;
      const cgst = updateData.cgst_amount ?? existing.cgst_amount ?? 0;
      const sgst = updateData.sgst_amount ?? existing.sgst_amount ?? 0;
      const igst = updateData.igst_amount ?? existing.igst_amount ?? 0;
      const grandTotal = totalWithoutTax + cgst + sgst + igst;
      updateData.amount_in_words = amountToWords(grandTotal, existing.payment?.currency || "INR");
    }

    if (payload.amount_in_words !== undefined) {
      updateData.amount_in_words = payload.amount_in_words;
    }

    const updated = await prismaClient.invoice.update({
      where: { id: payload.id },
      data: updateData,
    });

    return sendSuccess(res, updated as any, "Invoice updated successfully");
  } catch (error) {
    logger.error("Error in updateInvoice:", error);
    return sendError(res, 500, "Failed to update invoice");
  }
};

export const getInvoicePreview = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    if (!userId) return sendError(res, 400, "User ID is required");

    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      include: { billingInfo: true, userDetail: true },
    });
    if (!user) return sendError(res, 404, "User not found");

    const typeParam = qs(req.query.type);
    const invoiceType: "IND" | "EXP" =
      typeParam === "IND" || typeParam === "EXP"
        ? typeParam
        : determineInvoiceType(user.billingInfo?.country || "India");

    const invoiceNumber = await getNextInvoiceNumber(invoiceType);

    const state = user.billingInfo?.state || user.userDetail?.country || "";
    const stateCode = user.billingInfo?.stateCode || getStateCodeFromName(state);
    const taxPreview = calculateTax(0, invoiceType, state, stateCode);

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);

    const orphanPayments = await prismaClient.payment.findMany({
      where: {
        userId,
        invoice: null,
        status: "CAPTURED",
      },
      select: {
        id: true,
        razorpayPaymentId: true,
        amount: true,
        currency: true,
        method: true,
        createdAt: true,
        order: {
          select: { packageCount: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const period = formatPeriod(now);

    return sendSuccess(res, {
      preview: {
        invoice_number: invoiceNumber,
        invoice_type: invoiceType,
        service_name: "Android App Testing Package",
        sac_code: COMPANY_DETAILS.sacCode,
        period,
        quantity: 1,
        unit_price: 0,
        due_date: dueDate.toISOString().split("T")[0],
        place_of_supply: taxPreview.placeOfSupply,
        supply_type: taxPreview.supplyType,
        tax_rate: taxPreview.taxRate,
        cgst_amount: taxPreview.cgstAmount,
        sgst_amount: taxPreview.sgstAmount,
        igst_amount: taxPreview.igstAmount,
        amount_in_words: amountToWords(0, "INR"),
        lut_number: COMPANY_DETAILS.lutNumber,
      },
      orphanPayments,
    });
  } catch (error) {
    logger.error("Error in getInvoicePreview:", error);
    return sendError(res, 500, "Failed to fetch invoice preview");
  }
};

export const generateDemoPayment = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    if (!payload || !payload.userId) {
      return sendError(res, 400, "User ID is required");
    }

    const { userId, amount, currency = "INR", quantity = 1 } = payload;

    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, billingInfo: { select: { phone: true } }, userDetail: { select: { phone: true } } },
    });
    if (!user) return sendError(res, 404, "User not found");

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const demoOrderId = `DEMO_ORDER_${timestamp}_${random}`;
    const demoReceipt = `DEMO_RECEIPT_${timestamp}_${random}`;

    const result = await prismaClient.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          amount: Math.round(amount),
          currency,
          status: "PAID",
          packageCount: Math.max(1, Math.round(quantity)),
          razorpayOrderId: demoOrderId,
          receipt: demoReceipt,
        },
      });

      const demoPaymentId = `DEMO_PAY_${timestamp}_${random}`;
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          userId,
          amount: Math.round(amount),
          amount_inr: Math.round(amount),
          currency,
          status: "CAPTURED",
          method: "manual",
          captured: true,
          razorpayPaymentId: demoPaymentId,
          razorpayOrderId: demoOrderId,
          customer_name: user.name || null,
          customer_email: user.email || null,
          contact: user.billingInfo?.phone || user.userDetail?.phone || null,
          fee: 0,
          tax: 0,
          amountRefunded: 0,
          refundStatus: "NONE",
        },
      });

      return { payment, order };
    });

    return sendSuccess(
      res,
      {
        paymentId: result.payment.id,
        orderId: result.order.id,
        razorpayPaymentId: result.payment.razorpayPaymentId,
        amount: result.payment.amount,
        currency: result.payment.currency,
      },
      "Demo payment generated successfully"
    );
  } catch (error) {
    logger.error("Error in generateDemoPayment:", error);
    return sendError(res, 500, "Failed to generate demo payment");
  }
};

export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    if (!payload) return sendError(res, 400, "Payload is required");
    if (!payload.userId) return sendError(res, 400, "User ID is required");
    if (!payload.paymentId) return sendError(res, 400, "Payment ID is required");

    const user = await prismaClient.user.findUnique({
      where: { id: payload.userId },
      include: { billingInfo: true, userDetail: true },
    });
    if (!user) return sendError(res, 404, "User not found");

    const payment = await prismaClient.payment.findUnique({
      where: { id: payload.paymentId },
      include: { invoice: true, order: true },
    });
    if (!payment) return sendError(res, 404, "Payment not found");
    if (payment.userId !== payload.userId) {
      return sendError(res, 403, "Payment does not belong to this user");
    }
    if (payment.invoice) {
      return sendError(res, 409, "Payment already has an invoice linked");
    }

    const isDemoPayment = payment.razorpayPaymentId.startsWith("DEMO_");

    const result = await prismaClient.$transaction(async (tx) => {
      let invoiceNumber = payload.invoice_number;

      if (!invoiceNumber) {
        invoiceNumber = await getNextInvoiceNumber(
          payload.invoice_type as "IND" | "EXP",
          tx
        );
      } else {
        const existing = await tx.invoice.findUnique({
          where: { invoice_number: invoiceNumber },
        });
        if (existing) {
          invoiceNumber = await getNextInvoiceNumber(
            payload.invoice_type as "IND" | "EXP",
            tx
          );
        }
      }

      const unitPrice = Math.max(0, Math.round(payload.unit_price || 0));
      const quantity = Math.max(1, Math.round(payload.quantity || 1));
      const baseAmount = unitPrice * quantity;

      const state = user.billingInfo?.state || user.userDetail?.country || "";
      const stateCode = user.billingInfo?.stateCode || getStateCodeFromName(state);
      const invoiceType: "IND" | "EXP" =
        payload.invoice_type === "IND" || payload.invoice_type === "EXP"
          ? payload.invoice_type
          : determineInvoiceType(user.billingInfo?.country || "India");

      const taxInfo = calculateTax(baseAmount, invoiceType, state, stateCode);

      if (isDemoPayment) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            amount: baseAmount,
            amount_inr: baseAmount,
            currency: payment.currency,
          },
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            amount: baseAmount,
            packageCount: quantity,
          },
        });
      }

      const cgst = taxInfo.cgstAmount;
      const sgst = taxInfo.sgstAmount;
      const igst = taxInfo.igstAmount;
      const taxRate = taxInfo.taxRate;
      const grandTotal = baseAmount + cgst + sgst + igst;

      let amountInWords = payload.amount_in_words || amountToWords(grandTotal, payment.currency || "INR");

      const invoiceData: any = {
        paymentId: payment.id,
        userId: payload.userId,
        invoice_number: invoiceNumber,
        invoice_type: invoiceType,
        service_name: payload.service_name || "Android App Testing Package",
        sac_code: payload.sac_code || COMPANY_DETAILS.sacCode,
        period: payload.period || formatPeriod(new Date()),
        quantity,
        unit_price: unitPrice,
        tax_rate: taxRate,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        state_code: stateCode,
        place_of_supply: payload.place_of_supply || taxInfo.placeOfSupply,
        supply_type: payload.supply_type || taxInfo.supplyType,
        amount_in_words: amountInWords,
        lut_number: payload.lut_number || COMPANY_DETAILS.lutNumber,
      };

      if (payload.due_date) {
        invoiceData.due_date = new Date(payload.due_date);
      }

      const invoice = await tx.invoice.create({ data: invoiceData });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { invoiceId: invoiceNumber },
      });

      return invoice;
    });

    return sendSuccess(res, result as any, "Invoice created successfully");
  } catch (error) {
    logger.error("Error in createInvoice:", error);
    return sendError(res, 500, "Failed to create invoice");
  }
};

export const getFinanceRefunds = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(qs(req.query.page) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(qs(req.query.limit) || "20")));
    const skip = (page - 1) * limit;
    const status = qs(req.query.status);

    const where: any = {};
    if (status) where.status = status;

    const [refunds, total] = await Promise.all([
      prismaClient.refund.findMany({
        where,
        include: {
          payment: {
            select: {
              id: true,
              razorpayPaymentId: true,
              amount: true,
              currency: true,
              status: true,
              method: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prismaClient.refund.count({ where }),
    ]);

    return sendSuccess(res, {
      refunds: refunds.map((r) => ({
        id: r.id,
        razorpayRefundId: r.razorpayRefundId,
        razorpayPaymentId: r.razorpayPaymentId,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        reason: r.reason,
        speed: r.speed,
        payment: r.payment,
        createdAt: r.createdAt.toISOString(),
        processedAt: r.processedAt?.toISOString() || null,
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("Error in getFinanceRefunds:", error);
    return sendError(res, 500, "Failed to fetch refunds");
  }
};

export const getFinanceWithdrawals = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(qs(req.query.page) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(qs(req.query.limit) || "20")));
    const skip = (page - 1) * limit;
    const status = qs(req.query.status);
    const search = qs(req.query.search);

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [withdrawals, total] = await Promise.all([
      prismaClient.withdrawalRequest.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prismaClient.withdrawalRequest.count({ where }),
    ]);

    return sendSuccess(res, {
      withdrawals: withdrawals.map((w) => ({
        id: w.id,
        amount: w.amount,
        currency: w.currency,
        status: w.status,
        note: w.note,
        user: w.user,
        requestedAt: w.requestedAt.toISOString(),
        processedAt: w.processedAt?.toISOString() || null,
        createdAt: w.createdAt.toISOString(),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("Error in getFinanceWithdrawals:", error);
    return sendError(res, 500, "Failed to fetch withdrawals");
  }
};

export const approveWithdrawal = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return sendError(res, 400, "Invalid withdrawal ID");

    const withdrawal = await prismaClient.withdrawalRequest.findUnique({
      where: { id },
    });
    if (!withdrawal) return sendError(res, 404, "Withdrawal not found");
    if (withdrawal.status !== "PENDING") return sendError(res, 400, "Withdrawal is not pending");

    const updated = await prismaClient.withdrawalRequest.update({
      where: { id },
      data: { status: "APPROVED", processedAt: new Date() },
    });

    return sendSuccess(res, updated, "Withdrawal approved successfully");
  } catch (error) {
    logger.error("Error in approveWithdrawal:", error);
    return sendError(res, 500, "Failed to approve withdrawal");
  }
};

export const rejectWithdrawal = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return sendError(res, 400, "Invalid withdrawal ID");

    const withdrawal = await prismaClient.withdrawalRequest.findUnique({
      where: { id },
    });
    if (!withdrawal) return sendError(res, 404, "Withdrawal not found");
    if (withdrawal.status !== "PENDING") return sendError(res, 400, "Withdrawal is not pending");

    const { payload } = req.body;
    const note = payload?.note || "";

    const updated = await prismaClient.withdrawalRequest.update({
      where: { id },
      data: { status: "REJECTED", processedAt: new Date(), note: note || undefined },
    });

    return sendSuccess(res, updated, "Withdrawal rejected");
  } catch (error) {
    logger.error("Error in rejectWithdrawal:", error);
    return sendError(res, 500, "Failed to reject withdrawal");
  }
};

export const getFinancePricing = async (req: Request, res: Response) => {
  try {

    const pricing = await prismaClient.pricing.findMany({
      orderBy: { country_name: "asc" },
    });

    return sendSuccess(res, pricing as any);
  } catch (error) {
    logger.error("Error in getFinancePricing:", error);
    return sendError(res, 500, "Failed to fetch pricing");
  }
};

export const updateFinancePricing = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return sendError(res, 400, "Invalid pricing ID");

    const { payload } = req.body;
    if (!payload) return sendError(res, 400, "Payload is required");

    const { amount, is_active, country_name, currency_code, currency_symbol } = payload;

    const data: any = {};
    if (amount !== undefined) data.amount = amount;
    if (is_active !== undefined) data.is_active = is_active;
    if (country_name !== undefined) data.country_name = country_name;
    if (currency_code !== undefined) data.currency_code = currency_code;
    if (currency_symbol !== undefined) data.currency_symbol = currency_symbol;

    const updated = await prismaClient.pricing.update({
      where: { id },
      data,
    });

    return sendSuccess(res, updated as any, "Pricing updated successfully");
  } catch (error) {
    logger.error("Error in updateFinancePricing:", error);
    return sendError(res, 500, "Failed to update pricing");
  }
};

export const getUserWalletDetail = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    if (!userId) return sendError(res, 400, "User ID is required");

    const [wallet, transactions, withdrawals] = await Promise.all([
      prismaClient.userWallet.findUnique({
        where: { userId },
      }),
      prismaClient.userTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prismaClient.withdrawalRequest.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return sendSuccess(res, {
      wallet: wallet || { totalPoints: 0, totalPackages: 0, balanceMoney: 0 },
      transactions: transactions.map((t) => ({
        id: t.id,
        action: t.action,
        points: t.points,
        package: t.package,
        transactionType: t.transactionType,
        status: t.status,
        paymentMethod: t.paymentMethod,
        createdAt: t.createdAt.toISOString(),
      })),
      withdrawals: withdrawals.map((w) => ({
        id: w.id,
        amount: w.amount,
        currency: w.currency,
        status: w.status,
        note: w.note,
        requestedAt: w.requestedAt.toISOString(),
        processedAt: w.processedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    logger.error("Error in getUserWalletDetail:", error);
    return sendError(res, 500, "Failed to fetch user wallet details");
  }
};

export const getFinancePlans = async (req: Request, res: Response) => {
  try {

    const plans = await prismaClient.plans.findMany({
      orderBy: { price: "asc" },
    });

    return sendSuccess(res, plans.map((p: any) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      package: p.package,
      features: p.features,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })) as any);
  } catch (error) {
    logger.error("Error in getFinancePlans:", error);
    return sendError(res, 500, "Failed to fetch plans");
  }
};

export const getFinancePaymentMethods = async (req: Request, res: Response) => {
  try {

    const methods = await prismaClient.payment.groupBy({
      by: ["method"],
      _count: { _all: true },
      _sum: { amount: true },
      where: { method: { not: null } },
    });

    return sendSuccess(
      res,
      methods.map((m) => ({
        method: m.method,
        count: m._count._all,
        totalAmount: m._sum.amount || 0,
      })) as any,
    );
  } catch (error) {
    logger.error("Error in getFinancePaymentMethods:", error);
    return sendError(res, 500, "Failed to fetch payment methods");
  }
};
