import { auth } from "../../src/lib/auth";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

async function seedTester() {
  console.log("🌱 Seeding Tester User via Better Auth...");

  const testerEmail = "tester@gmail.com";
  const testerPassword = "Tester@123Password";

  // 1. Check if tester already exists
  const existingTester = await prisma.user.findUnique({
    where: { email: testerEmail },
  });

  if (existingTester) {
    console.log(
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

    // 3. Manually verify the email and create wallet
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
      },
    });

    console.log("✅ Tester user created successfully via Better Auth!");
    console.log(`📧 Email: ${testerEmail}`);
    console.log(`🔑 Password: ${testerPassword}`);
  } catch (error: any) {
    if (
      error.message?.includes("already exists") ||
      error.code === "user_already_exists"
    ) {
      console.log("ℹ️ Tester user already exists (caught error). Skipping...");
    } else {
      console.error("❌ Failed to seed tester:", error);
      throw error;
    }
  }
}

export { seedTester };
