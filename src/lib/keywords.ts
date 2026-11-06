/**
 * Parse free text into keywords. Accepts one per line and/or comma-separated.
 * Trims, collapses inner whitespace, drops empties and case-insensitive duplicates
 * (first spelling wins).
 */
export function parseKeywords(input: string): string[] {
  return dedupe(
    input
      .split(/[\n\r,]+/)
      .map((k) => k.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );
}

/** Add new keywords to an existing list without creating duplicates. */
export function mergeKeywords(existing: string[], incoming: string[]): string[] {
  return dedupe([...existing, ...incoming.map((k) => k.replace(/\s+/g, ' ').trim()).filter(Boolean)]);
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of list) {
    const key = k.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}
