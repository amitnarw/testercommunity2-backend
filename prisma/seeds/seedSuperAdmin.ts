import bcrypt from "bcrypt";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

export async function seedSuperAdmin() {
  console.log("Seeding super admin...");

  const superAdminEmail = "superadmin@example.com";
  const password = "SuperAdminPassword123";
  const hashedPassword = await bcrypt.hash(password, 10);

  const superAdminRole = await prisma.role.findUnique({
    where: { name: "super_admin" },
  });

  if (!superAdminRole) {
    throw new Error("Super admin role not found. Run roles/modules seed first!");
  }

  await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      name: "Super Admin",
      email: superAdminEmail,
      password: hashedPassword,
      emailVerified: true,
      authType: "email_and_password",
      role: "super_admin",
    },
  });

  console.log("Super admin seeded successfully!");
}
