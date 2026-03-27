// ── Instagram post dedup ──────────────────────────────────────────────────────
// Tracks which post shortcodes have already been commented on so the template
// runner can skip them on subsequent runs.
// Backed by chrome.storage.local under a dedicated key.

const STORAGE_KEY = 'olly.ig.seenPosts.v1';
const MAX_ENTRIES = 500;

async function readSeenSet(): Promise<Set<string>> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const arr: string[] = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  return new Set(arr);
}

async function writeSeenSet(set: Set<string>): Promise<void> {
  // Keep only the most-recent MAX_ENTRIES entries (last-in = most recent)
  const arr = Array.from(set);
  const trimmed = arr.length > MAX_ENTRIES ? arr.slice(arr.length - MAX_ENTRIES) : arr;
  await chrome.storage.local.set({ [STORAGE_KEY]: trimmed });
}

/** Returns true if this post shortcode has already been commented on. */
export async function hasSeenPost(shortcode: string): Promise<boolean> {
  const set = await readSeenSet();
  return set.has(shortcode);
}

/** Marks a post shortcode as commented. Call only after a successful submit. */
export async function markPostSeen(shortcode: string): Promise<void> {
  const set = await readSeenSet();
  set.add(shortcode);
  await writeSeenSet(set);
}

/** Clears all seen-post history (useful for testing / manual reset). */
export async function clearSeenPosts(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
