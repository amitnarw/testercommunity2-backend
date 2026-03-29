import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";
import { seedRolesModulesPermissions } from "./seedPermissions";
import { seedControlRoom } from "./seedControlRoom";
import { seedPlans } from "./seedPlans";
import { seedAppCategories } from "./seedAppCategories";
import { seedAdmin } from "./seedAdmin";
import { seedTester } from "./seedTester";
import { seedPromoCodes } from "./seedPromoCodes";

const prisma = prismaClient;

async function main() {
  logger.info("🌱 Starting master seed...");

  try {
    await seedRolesModulesPermissions();
    logger.info("✅ Permissions seeded");

    await seedControlRoom();
    logger.info("✅ Control Room seeded");

    await seedPlans();
    logger.info("✅ Plans seeded");

    await seedAppCategories();
    logger.info("✅ App Categories seeded");

    await seedAdmin();
    logger.info("✅ Admin seeded");

    await seedTester();
    logger.info("✅ Tester seeded");

    await seedPromoCodes();

    logger.info("🏁 All seeds completed successfully!");
  } catch (e) {
    logger.error("❌ Seeding failed:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
