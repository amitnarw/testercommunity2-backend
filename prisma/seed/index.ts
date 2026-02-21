import { prismaClient } from "../../src/lib/prisma";
import { seedRolesModulesPermissions } from "./seedPermissions";
import { seedControlRoom } from "./seedControlRoom";
import { seedPlans } from "./seedPlans";
import { seedAppCategories } from "./seedAppCategories";
import { seedAdmin } from "./seedAdmin";
import { seedTester } from "./seedTester";

const prisma = prismaClient;

async function main() {
  console.log("🌱 Starting master seed...");

  try {
    await seedRolesModulesPermissions();
    console.log("✅ Permissions seeded");

    await seedControlRoom();
    console.log("✅ Control Room seeded");

    await seedPlans();
    console.log("✅ Plans seeded");

    await seedAppCategories();
    console.log("✅ App Categories seeded");

    await seedAdmin();
    console.log("✅ Admin seeded");

    await seedTester();
    console.log("✅ Tester seeded");

    console.log("🏁 All seeds completed successfully!");
  } catch (e) {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
