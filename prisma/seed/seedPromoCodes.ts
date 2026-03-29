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
      fixedPoints: 200,
      isActive: true,
      maxUses: 100,
    },
  });

  logger.info("✅ Promo codes seeded");
}
