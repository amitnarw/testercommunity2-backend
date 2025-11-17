import { jwtVerify, SignJWT } from "jose";

interface JWTPayload {
  [claim: string]:
    | string
    | number
    | boolean
    | undefined
    | null
    | JWTPayload
    | JWTPayload[];
}

// Function to create a signed token
export async function createToken(
  payload: JWTPayload,
  type: "access_token" | "refresh_token" | "password_reset"
) {
  try {
    const expiresInSeconds =
      type === "access_token"
        ? process.env.ACCESS_TOKEN_EXPIRY
        : type === "refresh_token"
        ? process.env.REFRESH_TOKEN_EXPIRY
        : process.env.PASSWORD_RESET_TOKEN_EXPIRY;
    const secretKey =
      type === "access_token"
        ? process.env.ACCESS_TOKEN_SECRET
        : type === "refresh_token"
        ? process.env.REFRESH_TOKEN_SECRET
        : process.env.PASSWORD_RESET_TOKEN_SECRET;
    if (!expiresInSeconds || !secretKey) {
      return { success: false, error: "Token or secret key not found" };
    }

    // Convert string secret → Uint8Array
    const encoder = new TextEncoder();
    const encodedKey = encoder.encode(secretKey);

    const response = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
      .sign(encodedKey);

    return { success: true, data: response };
  } catch (err) {
    return { success: false, error: "Error while creating token" };
  }
}

// Function to verify token
export async function verifyToken(
  token: string,
  type: "access_token" | "refresh_token" | "password_reset"
) {
  try {
    const secretKey =
      type === "access_token"
        ? process.env.ACCESS_TOKEN_SECRET
        : type === "refresh_token"
        ? process.env.REFRESH_TOKEN_SECRET
        : process.env.PASSWORD_RESET_TOKEN_SECRET;
    if (!secretKey) {
      return { success: false, error: "Secret key not found" };
    }

    // Convert string secret → Uint8Array
    const encoder = new TextEncoder();
    const encodedKey = encoder.encode(secretKey);

    const { payload } = await jwtVerify(token, encodedKey);
    return { success: true, data: payload };
  } catch (err) {
    return { success: false, error: "Error while verifying token" };
  }
}
