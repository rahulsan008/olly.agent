const STORAGE_KEY = 'olly.selectorMemory.v1';

type SelectorMemory = Record<string, Record<string, string>>;
type SelectorCacheStoredEntry = SelectorCacheEntry & { query: string };
type SelectorCacheStore = Record<string, SelectorCacheStoredEntry>;

export interface SelectorCacheEntry {
  selector: string;
  tool: string;
  successCount: number;
  failCount: number;
  lastUsed: number;
}

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

async function readMemory(): Promise<SelectorMemory> {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  return (data[STORAGE_KEY] as SelectorMemory | undefined) ?? {};
}

async function writeMemory(memory: SelectorMemory): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: memory });
}

function selectorCacheKey(domain: string): string {
  return `selectors:${normalize(domain)}`;
}

async function readSelectorCache(domain: string): Promise<SelectorCacheStore> {
  const key = selectorCacheKey(domain);
  const data = await chrome.storage.local.get([key]);
  return (data[key] as SelectorCacheStore | undefined) ?? {};
}

async function writeSelectorCache(domain: string, cache: SelectorCacheStore): Promise<void> {
  const key = selectorCacheKey(domain);
  await chrome.storage.local.set({ [key]: cache });
}

export function getCurrentDomain(): string {
  return normalize(window.location.hostname || 'unknown');
}

export async function saveSelector(domain: string, query: string, selector: string): Promise<void> {
  const d = normalize(domain);
  const q = normalize(query);
  if (!d || !q || !selector.trim()) return;

  const memory = await readMemory();
  const byDomain = memory[d] ?? {};
  byDomain[q] = selector;
  memory[d] = byDomain;
  await writeMemory(memory);
}

export async function getSelector(domain: string, query: string): Promise<string | null> {
  const d = normalize(domain);
  const q = normalize(query);
  if (!d || !q) return null;

  const memory = await readMemory();
  return memory[d]?.[q] ?? null;
}

export async function saveSelectorForCurrentDomain(query: string, selector: string): Promise<void> {
  await saveSelector(getCurrentDomain(), query, selector);
}

export async function getSelectorForCurrentDomain(query: string): Promise<string | null> {
  return getSelector(getCurrentDomain(), query);
}

export async function getAllSelectorMemory(): Promise<SelectorMemory> {
  return readMemory();
}

export async function getCachedSelectors(domain: string): Promise<string> {
  const d = normalize(domain);
  if (!d) return '';
  const cache = await readSelectorCache(d);
  const entries = Object.values(cache)
    .filter((entry) => entry.successCount > 0 && !!entry.selector)
    .sort((a, b) => {
      if (b.successCount !== a.successCount) return b.successCount - a.successCount;
      return b.lastUsed - a.lastUsed;
    })
    .slice(0, 20);

  if (!entries.length) return '';
  const lines = entries.map((entry) => `- '${entry.query}' → ${entry.selector} (used ${entry.successCount}x)`);
  return `Known working selectors:\n${lines.join('\n')}`;
}

export async function recordSelectorSuccess(domain: string, query: string, selector: string, tool: string): Promise<void> {
  const d = normalize(domain);
  const q = normalize(query);
  const s = selector.trim();
  const t = tool.trim();
  if (!d || !q || !s || !t) return;

  const cache = await readSelectorCache(d);
  const current = cache[q] ?? {
    query,
    selector: s,
    tool: t,
    successCount: 0,
    failCount: 0,
    lastUsed: 0
  };

  cache[q] = {
    ...current,
    query,
    selector: s,
    tool: t,
    successCount: current.successCount + 1,
    lastUsed: Date.now()
  };

  const entries = Object.entries(cache);
  if (entries.length > 50) {
    entries
      .sort((a, b) => {
        if (a[1].successCount !== b[1].successCount) return a[1].successCount - b[1].successCount;
        return a[1].lastUsed - b[1].lastUsed;
      })
      .slice(0, entries.length - 50)
      .forEach(([key]) => { delete cache[key]; });
  }

  await writeSelectorCache(d, cache);
}

export async function recordSelectorFailure(domain: string, query: string): Promise<void> {
  const d = normalize(domain);
  const q = normalize(query);
  if (!d || !q) return;

  const cache = await readSelectorCache(d);
  const existing = cache[q];
  if (!existing) return;

  existing.failCount += 1;
  if (existing.failCount > 3 && existing.successCount === 0) {
    delete cache[q];
  } else {
    cache[q] = existing;
  }

  await writeSelectorCache(d, cache);
}
