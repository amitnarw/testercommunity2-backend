import { jwtVerify, SignJWT } from "jose";

interface JWTPayload {
  [claim: string]: string | number | boolean | undefined | null | JWTPayload | JWTPayload[];
}

// Secret key for signing/encryption
const SECRET_KEY = new TextEncoder().encode(process.env.TOKEN_SECRET || "supersecretkey");

// Function to create a signed token
export async function createToken(payload: JWTPayload, expiresInSeconds = 3600) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(SECRET_KEY);
}

// Function to verify token
export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, payload: null };
  }
}
