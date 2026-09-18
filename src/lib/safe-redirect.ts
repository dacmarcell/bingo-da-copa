// Only same-site, path-relative redirects are allowed. Anything else (absolute URLs,
// protocol-relative "//host", "javascript:" URLs, backslash tricks) falls back to `fallback`.
export function getSafeRedirect(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  try {
    const base = "http://localhost";
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    const path = url.pathname + url.search + url.hash;
    // "/.//host" normalizes to "//host", which browsers treat as protocol-relative
    if (path.startsWith("//")) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
