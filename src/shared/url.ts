/**
 * Normalises whatever a user typed into a web address, or refuses it.
 *
 * Shared because both sides need the same answer: main stores the normalised
 * form, and the renderer compares against it to decide whether the current
 * page is already bookmarked.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    // Only the web: a Speed Dial tile or bookmark is not a place to stash a
    // file: or javascript: URL.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
