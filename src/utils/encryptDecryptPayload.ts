import { CompactEncrypt, compactDecrypt } from "jose";

// --- Shared secret key (32 bytes for A256GCM) ---
const secretKeyBase64 = process.env.ENCRYPTION_SECRET;

if (!secretKeyBase64) {
  throw new Error("encryptDecryptPayload ERROR: ENCRYPTION_SECRET not found");
}

// Convert base64 string to Uint8Array
const secretKey = Uint8Array.from(Buffer.from(secretKeyBase64, "base64"));

export type JSONValue = string | number | boolean | null | { [key: string]: JSONValue } | JSONValue[];

export async function encryptData<T extends JSONValue>(data: T): Promise<string> {
  const encoder = new TextEncoder();
  const jwe = await new CompactEncrypt(encoder.encode(JSON.stringify(data)))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(secretKey);
  return jwe;
}

export async function decryptData<T extends JSONValue>(jwe: string): Promise<T> {
  const { plaintext } = await compactDecrypt(jwe, secretKey);
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintext)) as T;
}
