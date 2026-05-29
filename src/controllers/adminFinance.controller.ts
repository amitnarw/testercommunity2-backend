import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";
import { type Request, type Response } from "express";
import logger from "../utils/logger";
import { amountToWords } from "@/utils/invoice.utils";

const requireSuperAdmin = (req: Request, res: Response): boolean => {
  if (req.role !== "super_admin") {
    sendError(res, 403, "Only super_admin can access finance data");
    return false;
  }
  return true;
};

const qs = (val: any): string | undefined =>
  typeof val === "string" ? val : undefined;

export const getFinanceDashboard = async (req: Request, res: Response) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

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
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;
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
      "service_name", "period", "quantity", "unit_price",
      "tax_rate", "cgst_amount", "sgst_amount", "igst_amount",
      "due_date", "place_of_supply", "supply_type",
      "amount_in_words", "lut_number", "sac_code",
    ];

    const updateData: any = {};
    let shouldRecalcWords = false;

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

export const getFinanceRefunds = async (req: Request, res: Response) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;

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
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;
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
    if (!requireSuperAdmin(req, res)) return;

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
    if (!requireSuperAdmin(req, res)) return;

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
