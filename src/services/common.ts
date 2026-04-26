export function extractPackageName(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get("id");
  } catch {
    return null;
  }
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
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "play-lh.googleusercontent.com" &&
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}