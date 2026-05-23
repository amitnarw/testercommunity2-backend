import logger from "../../src/utils/logger";
import { auth } from "../../src/lib/auth";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

async function seedTester() {
  logger.info("🌱 Seeding Tester User via Better Auth...");

  const testerEmail = "tester@gmail.com";
  const testerPassword = "Tester@123Password";

  // 1. Check if tester already exists
  const existingTester = await prisma.user.findUnique({
    where: { email: testerEmail },
  });

  if (existingTester) {
    logger.info(
      "ℹ️ Tester user already exists (checked via Prisma). Skipping...",
    );
    return;
  }

  try {
    // 2. Create User via Better Auth API
    // The 'role' field in the body is picked up by the databaseHooks.user.create.before hook
    await auth.api.signUpEmail({
      body: {
        email: testerEmail,
        password: testerPassword,
        name: "Pro Tester",
        role: "tester",
        auth_type: "EMAIL_PASSWORD",
        first_name: "Pro",
        last_name: "Tester",
      } as any,
    });

    // 3. Manually verify the email, create wallet, and mark as approved
    await prisma.user.update({
      where: { email: testerEmail },
      data: {
        emailVerified: true,
        wallet: {
          create: {
            totalPoints: 0,
            totalPackages: 0,
          },
        },
        userDetail: {
          update: {
            application_status: "APPROVED",
          },
        },
      },
    });

    logger.info("✅ Tester user created successfully via Better Auth!");
    logger.info(`📧 Email: ${testerEmail}`);
    logger.info(`🔑 Password: ${testerPassword}`);
  } catch (error: any) {
    if (
      error.message?.includes("already exists") ||
      error.code === "user_already_exists"
    ) {
      logger.info("ℹ️ Tester user already exists (caught error). Skipping...");
    } else {
      logger.error("❌ Failed to seed tester:", error);
      throw error;
    }
  }
}

export { seedTester };
