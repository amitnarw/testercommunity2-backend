import { auth } from "@/lib/auth";
import { toNodeHandler } from "better-auth/node";
import Router from "express";
// import { Prisma } from "prisma/generated/prisma";

const router = Router();

// Custom sign-out handler to gracefully handle missing sessions
// router.post("/sign-out", async (req, res) => {
//   try {
//     // Let better-auth handle the sign-out - it will try to delete the session
//     // We just need to catch the P2025 error if the session doesn't exist
//     await new Promise((resolve, reject) => {
//       const handler = toNodeHandler(auth);
//       // @ts-ignore - better-auth handler accepts 3 args in practice
//       handler(req, res, (err: any) => {
//         if (err) reject(err);
//         else resolve(true);
//       });
//     });
//   } catch (error: any) {
//     // Handle Prisma P2025 error - session not found
//     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
//       // Session doesn't exist in DB, but that's okay for sign-out
//       // Clear all possible auth cookies
//       const isProduction = process.env.NODE_ENV === "production";
//       const cookieOptions = {
//         httpOnly: true,
//         secure: isProduction,
//         sameSite: "lax" as const,
//         path: "/",
//         maxAge: 0,
//         domain: isProduction ? process.env.COOKIE_DOMAIN : undefined
//       };
      
//       const cookieStrings = [
//         "better-auth.session_token=",
//         "better-auth.session=",
//         "better-auth.session_data=",
//         "better-auth.dont_remember=",
//         "better-auth.role_cache="
//       ].map(name => `${name}; ${Object.entries(cookieOptions).map(([k, v]) => `${k}=${v}`).join("; ")}`);
      
//       res.setHeader("Set-Cookie", cookieStrings);
//       return res.status(200).json({ message: "Signed out successfully" });
//     }
//     // Re-throw other errors
//     throw error;
//   }
// });

// Handle all other auth routes with better-auth
router.all("/{*any}", toNodeHandler(auth));

export default router;
