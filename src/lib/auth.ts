import "better-auth";
import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prismaClient } from "./prisma";
import { sendEmail } from "@/services/resend";
import { createAuthMiddleware, customSession } from "better-auth/plugins";
import type { UserAuthType } from "prisma/generated/prisma";
import { SignJWT } from "jose";

const rolePlugin = customSession(async ({ user, session }, ctx) => {
  const role = await prismaClient?.userDetail?.findUnique({
    where: {
      userId: session?.userId,
    },
    select: {
      initial: true,
      role: {
        select: {
          name: true,
          permissions: true,
        },
      },
    },
  });
  await setRoleCookie(ctx, role?.role, role?.initial || false);
  return {
    ...role,
    user,
    session,
  };
});

const isProduction = process.env.NODE_ENV === "production";

const getCookieConfig = () => ({
  httpOnly: true,
  secure: true,
  sameSite: (isProduction ? "strict" : "none") as "strict" | "lax" | "none",
  path: "/",
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
  },
  initial?: boolean
) {
  if (role) {
    const secret = process.env.BETTER_AUTH_SECRET!;
    const payload = { role, initial };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(secret));

    const cookieName = "better-auth.role_cache";
    ctx.setCookie(cookieName, token, getCookieConfig());
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
      maxAge: 60 * 60,
      strategy: "compact",
    },
  },
  plugins: [rolePlugin],
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-out") {
        ctx.setCookie("better-auth.role_cache", "", {
          maxAge: 0,
          ...getCookieConfig(),
        });
      }
    }),
  },

  advanced: {
    cookies: {
      role_cache: {
        name: "role_cache",
        attributes: getCookieConfig(),
      },
      session: {
        name: "better-auth.session",
        attributes: getCookieConfig(),
      },

      session_token: {
        name: "better-auth.session_token",
        attributes: getCookieConfig(),
      },

      dont_remember: {
        name: "better-auth.dont_remember",
        attributes: getCookieConfig(),
      },

      session_data: {
        name: "better-auth.session_data",
        attributes: getCookieConfig(),
      },
    },
  },

  trustedOrigins: (request) => {
    const origin = request.headers.get("origin");
    const allowedOrigins = process.env.CORS_ORIGIN?.split(",") || [];

    if (!origin || origin === "null") {
      return ["*"];
    }

    return allowedOrigins;
  },

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

export type SessionWithRole = typeof auth.$Infer.Session;
