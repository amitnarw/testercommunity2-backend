import "better-auth";
import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prismaClient } from "./prisma";
import { sendEmail } from "@/services/resend";
import { createAuthMiddleware, customSession } from "better-auth/plugins";
import type { UserAuthType } from "@prisma/client";
import { SignJWT } from "jose";
import logger from "../utils/logger";

const rolePlugin = customSession(async ({ user, session }, ctx) => {
  try {
    const userDetail = await prismaClient?.userDetail?.findUnique({
      where: {
        userId: session?.userId,
      },
      select: {
        initial: true,
        banned: true,
        ban_reason: true,
        application_status: true,
        role: {
          select: {
            name: true,
            permissions: {
              select: {
                moduleId: true,
                canReadList: true,
                canReadSingle: true,
                canCreate: true,
                canUpdate: true,
                canDelete: true,
                module: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });
    await setRoleCookie(
      ctx,
      userDetail?.role,
      userDetail?.initial || false,
      userDetail?.banned || false,
      userDetail?.ban_reason || null,
      userDetail?.application_status || null,
    );
    return {
      role: userDetail?.role,
      initial: userDetail?.initial,
      banned: userDetail?.banned,
      ban_reason: userDetail?.ban_reason,
      applicationStatus: userDetail?.application_status,
      user,
      session,
    };
  } catch (error) {
    logger.error("rolePlugin error during get-session", error);
    return {
      role: null,
      initial: false,
      banned: false,
      ban_reason: null,
      applicationStatus: null,
      user,
      session,
    };
  }
});

const isProduction = process.env.NODE_ENV === "production";

const getCookieConfig = () => ({
  httpOnly: true,
  secure: true,
  sameSite: (isProduction ? "lax" : "none") as "strict" | "lax" | "none",
  path: "/",
  domain: isProduction ? process.env.COOKIE_DOMAIN || undefined : undefined,
});

async function setRoleCookie(
  ctx: any,
  role?: {
    name: string;
    permissions: {
      moduleId: number;
      canReadList: boolean;
      canReadSingle: boolean;
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
      module: { name: string };
    }[];
  },
  initial?: boolean,
  banned?: boolean,
  ban_reason?: string | null,
  applicationStatus?: string | null,
) {
  if (role) {
    const secret = process.env.BETTER_AUTH_SECRET!;
    const payload = { role, initial, banned, ban_reason, applicationStatus };

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
  socialProviders: {
    google: {
      prompt: "select_account",
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60,
    },
  },
  plugins: [rolePlugin],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        const { email } = ctx.body as { email: string };

        if (!email) {
          return;
        }

        const user = await prismaClient?.user.findUnique({
          where: { email },
          include: {
            userDetail: true,
          },
        });

        if (user?.userDetail?.auth_type === "GOOGLE") {
          throw new APIError("BAD_REQUEST", {
            message:
              "You already have an account with Google. Please sign in with that.",
          });
        }

        if (user?.userDetail?.banned) {
          const errorMessage = user.userDetail.ban_reason
            ? user.userDetail.ban_reason
            : "Your account has been suspended. Please contact support.";
          throw new APIError("FORBIDDEN", {
            code: "ACCOUNT_BANNED",
            message: errorMessage,
          });
        }
      }
    }),
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
        from: "inTesters <noreply@system.intesters.com>",
        to: user.email,
        subject: "Verify your email address | inTesters",
        html: `Click the link to verify your email: ${frontendUrl}`,
      });
    },
    async afterEmailVerification(user, request) {
      logger.info(`${user.email} has been successfully verified!`);
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (data, ctx) => {
          // Handle role: use provided role or default to "user"
          const role = (ctx?.body?.role ?? "user") as string;

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

          let auth_type = ctx?.body?.auth_type as string;
          let first_name = ctx?.body?.first_name as string;
          let last_name = ctx?.body?.last_name as string;

          // About You fields
          let bio = ctx?.body?.bio as string;
          let years_of_experience = ctx?.body?.years_of_experience as string;
          let areas_of_expertise = ctx?.body?.areas_of_expertise as string[];

          // Device info
          let device_company = ctx?.body?.device_company as string;
          let device_model = ctx?.body?.device_model as string;
          let ram = ctx?.body?.ram as string;
          let os = ctx?.body?.os as string;
          let screen_resolution = ctx?.body?.screen_resolution as string;
          let language = ctx?.body?.language as string;
          let network = ctx?.body?.network as string;

          // Contact info
          let country = ctx?.body?.country as string;
          let phone = ctx?.body?.phone as string;

          // If names are missing (e.g. OAuth), parse from user.name
          if (!first_name || !last_name) {
            const parts = user.name.split(" ");
            if (!first_name) first_name = parts[0];
            if (!last_name) last_name = parts.slice(1).join(" ") || "";
          }

          // If auth_type is missing (e.g. OAuth), default to GOOGLE if reasonable
          if (!auth_type) {
            auth_type = "GOOGLE";
          }

          const isTester = roleRecord?.name === "tester";

          await prismaClient?.userDetail?.upsert({
            where: {
              userId: user?.id,
            },
            update: {
              roleId: roleRecord?.id,
              bio,
              years_of_experience,
              areas_of_expertise,
              device_company,
              device_model,
              ram,
              os,
              screen_resolution,
              language,
              network,
              country,
              phone,
              ...(isTester ? { initial: false } : {}),
            },
            create: {
              userId: user?.id,
              first_name: first_name,
              last_name: last_name,
              auth_type: auth_type as UserAuthType,
              roleId: roleRecord?.id,
              bio,
              years_of_experience,
              areas_of_expertise,
              device_company,
              device_model,
              ram,
              os,
              screen_resolution,
              language,
              network,
              country,
              phone,
              initial: isTester ? false : true,
              ...(isTester ? { application_status: "PENDING" } : {}),
            },
          });
        },
      },
    },
    session: {
      create: {
        before: async (session, ctx) => {
          if (!ctx) return;

          const userDetail = await prismaClient?.userDetail?.findUnique({
            where: { userId: session.userId },
            select: { banned: true, ban_reason: true },
          });

          if (userDetail?.banned) {
            const errorMessage = userDetail.ban_reason
              ? userDetail.ban_reason
              : "Your account has been suspended. Please contact support.";

            // For OAuth callbacks, redirect to banned page
            if (ctx.path && (ctx.path.startsWith("/callback") || ctx.path.startsWith("/oauth2/callback"))) {
              const origin = process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:3000";
              const bannedURL = `${origin}/banned?error_description=${encodeURIComponent(errorMessage)}`;
              throw ctx.redirect(bannedURL);
            }

            throw new APIError("FORBIDDEN", {
              message: errorMessage,
            });
          }
        },
      },
    },
  },
});

export type SessionWithRole = typeof auth.$Infer.Session;
