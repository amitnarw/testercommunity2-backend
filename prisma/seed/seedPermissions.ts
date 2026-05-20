import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

async function seedRolesModulesPermissions() {
  logger.info("Seeding roles, modules, and permissions...");

  // 1️⃣ Roles
  const roles = [
    "super_admin",
    "admin",
    "moderator",
    "support",
    "user",
    "tester",
  ];
  for (const roleName of roles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }

  // 2️⃣ Modules (must match route definitions)
  const modules = [
    "control_room",
    "dashboard",
    "submissions",
    "feedback",
    "users",
    "suggestions",
    "notifications",
    "tester_applications",
    "promo_codes",
    "blogs",
    "testimonial",
    "authors",
    "review",
    "verification",
    "logs",
    "support",
  ];
  for (const moduleName of modules) {
    await prisma.module.upsert({
      where: { name: moduleName },
      update: {},
      create: { name: moduleName },
    });
  }

  // 3️⃣ Permissions using upsert so re-running updates existing rows
  const allRoles = await prisma.role.findMany();
  const allModules = await prisma.module.findMany();

  for (const role of allRoles) {
    for (const module of allModules) {
      const canRead = role.name !== "user" && role.name !== "tester";
      const canWrite = role.name === "admin" || role.name === "super_admin";
      const canDelete = role.name === "super_admin";

      await prisma.permission.upsert({
        where: { roleId_moduleId: { roleId: role.id, moduleId: module.id } },
        update: {
          canReadList: canRead,
          canReadSingle: canRead,
          canCreate: canWrite,
          canUpdate: canWrite,
          canDelete: canDelete,
        },
        create: {
          roleId: role.id,
          moduleId: module.id,
          canReadList: canRead,
          canReadSingle: canRead,
          canCreate: canWrite,
          canUpdate: canWrite,
          canDelete: canDelete,
        },
      });
    }
  }

  logger.info("Roles, modules, and permissions seeded successfully!");
}

// Export the function for use in the master seed file
export { seedRolesModulesPermissions };
