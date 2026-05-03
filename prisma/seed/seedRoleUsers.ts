import logger from "../../src/utils/logger";
import { auth } from "../../src/lib/auth";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

const ROLE_USERS = [
  {
    role: "super_admin",
    email: "super_admin@intesters.com",
    password: "Super@123Admin",
    name: "Super Admin",
    first_name: "Super",
    last_name: "Admin",
  },
  {
    role: "admin",
    email: "admin@intesters.com",
    password: "Admin@123Password",
    name: "Admin",
    first_name: "Admin",
    last_name: "User",
  },
  {
    role: "moderator",
    email: "moderator@intesters.com",
    password: "Moderator@123Pass",
    name: "Moderator",
    first_name: "Moderator",
    last_name: "User",
  },
  {
    role: "support",
    email: "support@intesters.com",
    password: "Support@123Pass",
    name: "Support",
    first_name: "Support",
    last_name: "User",
  },
  {
    role: "user",
    email: "user@gmail.com",
    password: "user@123",
    name: "Developer",
    first_name: "Developer",
    last_name: "User",
  },
] as const;

async function seedRoleUsers() {
  logger.info("🌱 Seeding role users via Better Auth...");

  for (const user of ROLE_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: user.email },
    });

    if (existing) {
      logger.info(`ℹ️  ${user.role} user already exists. Skipping...`);
      continue;
    }

    try {
      await auth.api.signUpEmail({
        body: {
          email: user.email,
          password: user.password,
          name: user.name,
          role: user.role,
          auth_type: "EMAIL_PASSWORD",
          first_name: user.first_name,
          last_name: user.last_name,
        } as any,
      });

      await prisma.user.update({
        where: { email: user.email },
        data: {
          emailVerified: true,
          wallet: {
            create: {
              totalPoints: 0,
              totalPackages: 0,
            },
          },
        },
      });

      logger.info(`✅ ${user.role} created — ${user.email}`);
    } catch (error: any) {
      if (
        error.message?.includes("already exists") ||
        error.code === "user_already_exists"
      ) {
        logger.info(`ℹ️  ${user.role} user already exists (caught error). Skipping...`);
      } else {
        logger.error(`❌ Failed to seed ${user.role}:`, error);
        throw error;
      }
    }
  }

  logger.info("✅ All role users seeded successfully!");
}

export { seedRoleUsers };