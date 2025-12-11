import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prismaClient } from "./prisma";
import { sendEmail } from "@/services/resend";
import { customSession } from "better-auth/plugins";
import type { UserAuthType } from "prisma/generated/prisma";
import { SignJWT } from "jose";

const rolePlugin = customSession(async ({ user, session }, ctx) => {
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
  await setRoleCookie(ctx, role?.role);
  return {
    ...role,
    user,
    session,
  };
});

async function setRoleCookie(
  ctx: any,
  role?: {
    name: string;
    permissions: {
      id: number;
      createdAt: Date;
      updatedAt: Date;
      roleId: number;
      moduleId: number;
      canReadList: boolean;
      canReadSingle: boolean;
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }[];
  }
) {
  if (role) {
    const secret = process.env.BETTER_AUTH_SECRET!;
    const payload = { role };
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(secret));

    const cookieName = "better-auth.role_cache";
    ctx.setCookie(cookieName, token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
  }
}

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
      maxAge: 5 * 60,
    },
  },
  plugins: [rolePlugin],

  advanced: {
    cookies: {
      role_cache: {
        name: "role_cache",
        attributes: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        },
      },
    },
  },

  trustedOrigins: process.env.CORS_ORIGIN?.split(",") ?? [
    "http://localhost:3000",
  ],

  secret: process.env.BETTER_AUTH_SECRET,

  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {
      const frontendUrl = `${
        process.env.CORS_ORIGIN?.split(",")[0]
      }/auth/verification?token=${token}`;
      await sendEmail({
        from: "Acme <onboarding@resend.dev>",
        to: user.email,
        subject: "Verify your email address",
        html: `Click the link to verify your email: ${frontendUrl}`,
      });
    },
    async afterEmailVerification(user, request) {
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
          const auth_type = ctx?.body?.auth_type as string;
          const first_name = ctx?.body?.first_name as string;
          const last_name = ctx?.body?.last_name as string;

          await prismaClient?.userDetail?.upsert({
            where: {
              userId: user?.id,
            },
            update: {
              roleId: roleRecord?.id,
            },
            create: {
              userId: user?.id,
              first_name: first_name,
              last_name: last_name,
              auth_type: auth_type as UserAuthType,
              roleId: roleRecord?.id,
            },
          });
        },
      },
    },
  },
});
