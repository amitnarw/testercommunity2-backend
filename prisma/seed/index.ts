import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";
import { seedRolesModulesPermissions } from "./seedPermissions";
import { seedControlRoom } from "./seedControlRoom";
import { seedPlans } from "./seedPlans";
import { seedAppCategories } from "./seedAppCategories";
import { seedRoleUsers } from "./seedRoleUsers";
import { seedTester } from "./seedTester";
import { seedPromoCodes } from "./seedPromoCodes";
import { seedBlogs } from "./seedBlogs";
import { seedTestimonials } from "./seedTestimonials";
import { seedPricing } from "./seedPricing";
import { seedAuthors } from "./seedAuthors";
import { seedFaq } from "./seedFaq";
import { seedGuides } from "./seedGuides";

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

    await seedRoleUsers();
    logger.info("✅ Role users seeded");

    await seedTester();
    logger.info("✅ Tester seeded");

    await seedPromoCodes();

    await seedBlogs();

    await seedTestimonials();

    await seedPricing();

    await seedAuthors();

    await seedFaq();

    await seedGuides();

    logger.info("🏁 All seeds completed successfully!");
  } catch (e) {
    logger.error("❌ Seeding failed:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
