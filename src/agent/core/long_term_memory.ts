const STORAGE_KEY = 'olly.selectorMemory.v1';

type SelectorMemory = Record<string, Record<string, string>>;

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
