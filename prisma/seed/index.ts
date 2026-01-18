import { prismaClient } from "../../src/lib/prisma";
import { seedRolesModulesPermissions } from "./seedPermissions";
import { seedControlRoom } from "./seedControlRoom";
import { seedPlans } from "./seedPlans";
import { seedAppCategories } from "./seedAppCategories";

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

    console.log("🏁 All seeds completed successfully!");
  } catch (e) {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
