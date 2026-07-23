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
    const isAdmin = ["super_admin", "admin", "moderator", "support"].includes(roleName);
    await prisma.role.upsert({
      where: { name: roleName },
      update: { isAdmin },
      create: { name: roleName, isAdmin },
    });
  }

  // 2️⃣ Modules (must match route definitions)
  const modules = [
    "control_room",
    "dashboard",
    "submissions",
    "feedback",
    "finance",
    "users",
    "suggestions",
    "notifications",
    "tester_applications",
    "promo_codes",
    "blogs",
    "guides",
    "guide_categories",
    "testimonial",
    "authors",
    "review",
    "verification",
    "logs",
    "support",
    "permissions",
    "faqs",
    "iar",
    "tester_activity",
    "mail",
  ];
  for (const moduleName of modules) {
    await prisma.module.upsert({
      where: { name: moduleName },
      update: {},
      create: { name: moduleName },
    });
  }

  // 3️⃣ Permissions ,  granular per-role matrix
  const allRoles = await prisma.role.findMany();
  const allModules = await prisma.module.findMany();

  const permissionMatrix: Record<
    string,
    {
      canReadList: boolean;
      canReadSingle: boolean;
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }
  > = {
    super_admin: {
      canReadList: true,
      canReadSingle: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    },
    admin: {
      canReadList: true,
      canReadSingle: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    },
    moderator: {
      canReadList: false,
      canReadSingle: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    },
    support: {
      canReadList: true,
      canReadSingle: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    },
    user: {
      canReadList: false,
      canReadSingle: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    },
    tester: {
      canReadList: false,
      canReadSingle: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    },
  };

  // Moderator gets full CRUD only on blogs and authors
  const moderatorFullAccessModules = ["blogs", "authors", "guides", "guide_categories"];

  for (const role of allRoles) {
    const basePerms = permissionMatrix[role.name] || permissionMatrix.user;

    for (const module of allModules) {
      let perms = { ...basePerms };

      // Moderator overrides: CRUD on blogs and authors only
      if (role.name === "moderator") {
        if (moderatorFullAccessModules.includes(module.name)) {
          perms = {
            canReadList: true,
            canReadSingle: true,
            canCreate: true,
            canUpdate: true,
            canDelete: true,
          };
        }
      }

      // Finance is super_admin only by default
      if (role.name !== "super_admin" && module.name === "finance") {
        perms = {
          canReadList: false,
          canReadSingle: false,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
        };
      }

      // Permissions module is super_admin only (uses controller-level check, not checkAuthorization)
      if (role.name !== "super_admin" && module.name === "permissions") {
        perms = {
          canReadList: false,
          canReadSingle: false,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
        };
      }

      // Support role needs update access on the support module for chat
      if (role.name === "support" && module.name === "support") {
        perms = {
          canReadList: true,
          canReadSingle: true,
          canCreate: false,
          canUpdate: true,
          canDelete: false,
        };
      }

      // Support role needs read + update access on the mail module
      if (role.name === "support" && module.name === "mail") {
        perms = {
          canReadList: true,
          canReadSingle: true,
          canCreate: false,
          canUpdate: true,
          canDelete: false,
        };
      }

      await prisma.permission.upsert({
        where: { roleId_moduleId: { roleId: role.id, moduleId: module.id } },
        update: {},
        create: {
          roleId: role.id,
          moduleId: module.id,
          ...perms,
        },
      });
    }
  }

  logger.info("Roles, modules, and permissions seeded successfully!");
}

// Export the function for use in the master seed file
export { seedRolesModulesPermissions };
