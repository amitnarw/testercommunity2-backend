import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

async function seedRolesModulesPermissions() {
  console.log("Seeding roles, modules, and permissions...");

  // 1️⃣ Roles
  const roles = ["super_admin", "admin", "moderator", "support", "user", "tester"];
  for (const roleName of roles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }

  // 2️⃣ Modules (Example: adjust as per your app)
  const modules = ["User", "Dashboard", "App", "Blog", "Feedback", "Support"];
  for (const moduleName of modules) {
    await prisma.module.upsert({
      where: { name: moduleName },
      update: {},
      create: { name: moduleName },
    });
  }

  // 3️⃣ Permissions (example defaults)
  const allRoles = await prisma.role.findMany();
  const allModules = await prisma.module.findMany();

  for (const role of allRoles) {
    for (const module of allModules) {
      // Only create if permission doesn’t exist
      //   await prisma.permission.upsert({
      //     where: { roleId: role.id, moduleId: module.id } ,
      //     update: {},
      //     create: {
      //       roleId: role.id,
      //       moduleId: module.id,
      //       canReadList: role.name !== "user",
      //       canReadSingle: role.name !== "user",
      //       canCreate: role.name === "admin" || role.name === "super_admin",
      //       canUpdate: role.name === "admin" || role.name === "super_admin",
      //       canDelete: role.name === "super_admin",
      //     },
      //   });

      const permission = await prisma.permission.findFirst({
        where: { roleId: role.id, moduleId: module.id },
      });

      if (!permission) {
        await prisma.permission.create({
          data: {
            roleId: role.id,
            moduleId: module.id,
            canReadList: role.name !== "user",
            canReadSingle: role.name !== "user",
            canCreate: role.name === "admin" || role.name === "super_admin",
            canUpdate: role.name === "admin" || role.name === "super_admin",
            canDelete: role.name === "super_admin",
          },
        });
      }
    }
  }

  console.log("Roles, modules, and permissions seeded successfully!");
}

async function main() {
  try {
    await seedRolesModulesPermissions();
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
