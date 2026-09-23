/**
 * Normalize a raw query/body value against a Prisma string-enum allowlist.
 * Returns the uppercased enum value when valid, otherwise `undefined` so the
 * caller can skip the filter instead of crashing Prisma with an invalid
 * enum value (stale clients, typos, crafted URLs).
 *
 * An optional `aliases` map translates legacy values (e.g. FREE → HANDSHAKE).
 */
export function normalizeEnumParam(
  value: unknown,
  allowed: readonly string[],
  aliases?: Record<string, string>,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const upper = value.trim().toUpperCase();
  if (!upper) return undefined;
  if (allowed.includes(upper)) return upper;
  if (aliases && upper in aliases) {
    const mapped = aliases[upper];
    if (allowed.includes(mapped)) return mapped;
  }
  return undefined;
}
export function extractPackageName(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get("id");
  } catch {
    return null;
  }
}

/**
 * Raw whitespace is never valid inside a URL string. Returns true when the
 * value contains spaces/tabs/newlines (e.g. a pasted "...02Q 1"), which
 * Next encodes to %20 and Google answers with 400. Encoded %20 sequences
 * are NOT matched — only literal whitespace.
 */
export function hasUrlWhitespace(url: unknown): boolean {
  return typeof url === "string" && url.length > 0 && /\s/.test(url);
}
export function isValidPlayStoreUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;
    const id = parsed.searchParams.get("id");
    if (host !== "play.google.com") return false;
    if (
      !path.startsWith("/store/apps/details") &&
      !path.startsWith("/apps/testing")
    ) {
      return false;
    }
    if (!id) return false;
    return true;
  } catch {
    return false;
  }
}

export function isValidPlayStoreLogoUrl(url: string): boolean {
  // Raw whitespace is never valid in a Play logo URL. This rejects rows like
  // "...02Q 1" (pasted with trailing junk) that Next encodes to %20 and
  // Google answers with 400.
  if (typeof url !== "string" || url !== url.trim() || /\s/.test(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // All *.googleusercontent.com subdomains (lh3–lh6, play-lh) are legit
    // Google image hosts.
    const isGoogleHost =
      host === "play-lh.googleusercontent.com" ||
      host.endsWith(".googleusercontent.com");
    return isGoogleHost && parsed.protocol === "https:";
  } catch {
    return false;
  }
}