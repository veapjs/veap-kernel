export interface RequestLike {
  headers: Headers | { get(name: string): string | null };
  method?: string;
}

/**
 * Verifies that a state-changing HTTP request originates from the same origin.
 * Checks the Sec-Fetch-Site and Origin headers against Host / X-Forwarded-Host.
 * Safe HTTP methods (GET, HEAD, OPTIONS) always pass.
 */
export function verifySameOrigin(request: Request | RequestLike): boolean {
  const method = (request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  // 1. Sec-Fetch-Site validation (Fetch Metadata standard)
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite === "cross-site") {
    return false;
  }

  // 2. Origin / Host validation
  const origin = request.headers.get("origin");
  const rawHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (origin && rawHost) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const host = (rawHost.split(",")[0] || "").trim().toLowerCase();
      return originHost === host;
    } catch {
      return false;
    }
  }

  return true;
}
