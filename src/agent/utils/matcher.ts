export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function tokenize(value: string): string[] {
  return normalizeText(value).split(' ').filter(Boolean);
}

export function scoreMatch(query: string, candidate: string): number {
  const q = normalizeText(query);
  const c = normalizeText(candidate);
  if (!q || !c) return 0;

  if (c === q) return 1;
  if (c.startsWith(q)) return 0.9;
  if (c.includes(q)) return 0.8;

  const qTokens = tokenize(q);
  const cTokens = tokenize(c);
  if (!qTokens.length || !cTokens.length) return 0;

  const hits = qTokens.filter((token) => cTokens.some((cToken) => cToken.includes(token))).length;
  return hits / qTokens.length;
}

export function bestMatch<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  threshold = 0.45
): { item: T; score: number } | null {
  let winner: { item: T; score: number } | null = null;

  for (const item of items) {
    const score = scoreMatch(query, getText(item));
    if (score < threshold) continue;
    if (!winner || score > winner.score) {
      winner = { item, score };
    }
  }

  return winner;
}
