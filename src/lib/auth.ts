import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prismaClient } from "./prisma";
import { sendEmail } from "@/services/resend";
import { customSession } from "better-auth/plugins";
import type { UserAuthType } from "prisma/generated/prisma";

const rolePlugin = customSession(async ({ user, session }) => {
  const role = await prismaClient?.userDetail?.findUnique({
    where: {
      userId: session?.userId,
    },
    select: {
      role: {
        select: {
          name: true,
          permissions: true,
        },
      },
    },
  });
  return {
    role,
    user,
    session,
  };
});

export const auth = betterAuth({
  database: prismaAdapter(prismaClient, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds (5 minutes)
    },
  },
  plugins: [rolePlugin],

  trustedOrigins: [process.env.CORS_ORIGIN ?? "http://localhost:3000"],

  secret: process.env.BETTER_AUTH_SECRET,

  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {
      const frontendUrl = `${process.env.CORS_ORIGIN}/auth/verification?token=${token}`;
      await sendEmail({
        from: "Acme <onboarding@resend.dev>",
        to: user.email,
        subject: "Verify your email address",
        html: `Click the link to verify your email: ${frontendUrl}`,
      });
    },
    async afterEmailVerification(user, request) {
      // Your custom logic here, e.g., grant access to premium features
      console.log(`${user.email} has been successfully verified!`);
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (data, ctx) => {
          const role = ctx?.body.role as string | undefined;

          if (!role) {
            throw new APIError("BAD_REQUEST", {
              message: "Role is required",
            });
          }

          const roleRecord = await prismaClient?.role.findFirst({
            where: { name: role },
          });

          if (!roleRecord) {
            throw new APIError("BAD_REQUEST", {
              message: "Role name not found",
            });
          }

          const { role: _discard, ...cleanData } = data;
          (ctx as any).state = { resolvedRole: roleRecord };
          return { data: cleanData };
        },

        after: async (user, ctx) => {
          const roleRecord = (ctx as any).state.resolvedRole as {
            id: number;
            createdAt: Date;
            updatedAt: Date;
            name: string;
          };
          const authType = (ctx?.body?.authType as string) ?? "user";
          const firstName = ctx?.body?.firstName as string;
          const lastName = ctx?.body?.lastName as string;

          await prismaClient?.userDetail?.upsert({
            where: {
              userId: user?.id,
            },
            update: {
              roleId: roleRecord?.id,
            },
            create: {
              userId: user?.id,
              first_name: firstName,
              last_name: lastName,
              authType: authType as UserAuthType,
              roleId: roleRecord?.id,
            },
          });
        },
      },
    },
  },
});
