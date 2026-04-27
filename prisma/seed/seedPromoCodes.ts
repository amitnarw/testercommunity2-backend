import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

export async function seedPromoCodes() {
  logger.info("🌱 Seeding promo codes...");

  await prisma.promoCode.upsert({
    where: { code: "WELCOME200" },
    update: {},
    create: {
      code: "WELCOME200",
      discountType: "FIXED",
      discountValue: 200,
      isActive: true,
      maxUses: 100,
    },
  });

  await prisma.promoCode.upsert({
    where: { code: "TEST" },
    update: {},
    create: {
      code: "TEST",
      discountType: "FIXED",
      discountValue: 0,
      isActive: true,
    },
  });

  logger.info("✅ Promo codes seeded");
}
