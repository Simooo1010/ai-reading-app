// Pure, client-safe. Links from Notion are data: only plain web links may
// become an href (no javascript:, data:, or other schemes).

/**
 * The link as a normalized http(s) URL, or null when it is empty, not a URL,
 * another scheme, or carries a user name or password.
 */
export function safeHttpUrl(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}
