import { auth } from "../../src/lib/auth";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

async function seedAdmin() {
  console.log("🌱 Seeding Admin User via Better Auth...");

  const adminEmail = "admin@gmail.com";
  const adminPassword = "Admin@123Password"; // Change this in production

  // 1. Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(
      "ℹ️ Admin user already exists (checked via Prisma). Skipping...",
    );
    return;
  }

  try {
    // 2. Create User via Better Auth API
    // This will correctly hash the password and trigger the 'after' hook to create UserDetail
    await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: adminPassword,
        name: "Super Admin",
        // role: "super_admin",
        // auth_type: "EMAIL_PASSWORD",
        // first_name: "Super",
        // last_name: "Admin",
      },
    });

    // 3. Manually verify the email and create wallet as hooks might not handle these
    const createdAdmin = await prisma.user.update({
      where: { email: adminEmail },
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

    console.log("✅ Admin user created successfully via Better Auth!");
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);
  } catch (error: any) {
    if (
      error.message?.includes("already exists") ||
      error.code === "user_already_exists"
    ) {
      console.log("ℹ️ Admin user already exists (caught error). Skipping...");
    } else {
      console.error("❌ Failed to seed admin:", error);
      throw error;
    }
  }
}

export { seedAdmin };
