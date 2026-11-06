/** robots.txt + sitemap.xml helpers. Parsers are pure; fetchers use global fetch. */

export const USER_AGENT_TOKEN = 'PageFinderBot';

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  sitemaps: string[];
}

/** Parse robots.txt, keeping rules for our UA token if present, otherwise for "*". */
export function parseRobots(txt: string, ua = USER_AGENT_TOKEN): RobotsRules {
  const sitemaps: string[] = [];
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'sitemap') {
      if (val) sitemaps.push(val);
      continue;
    }
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], allow: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' && val) cur.allow.push(val);
    if (key === 'disallow' && val) cur.disallow.push(val);
  }
  const mine = groups.filter((g) => g.agents.includes(ua.toLowerCase()));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
    sitemaps,
  };
}

function ruleToRegex(rule: string): RegExp {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

/** Longest matching rule wins; Allow wins ties. */
export function isAllowed(rules: RobotsRules, pathAndQuery: string): boolean {
  let best = { len: -1, allow: true };
  for (const r of rules.disallow) if (ruleToRegex(r).test(pathAndQuery) && r.length > best.len) best = { len: r.length, allow: false };
  for (const r of rules.allow) if (ruleToRegex(r).test(pathAndQuery) && r.length >= best.len) best = { len: r.length, allow: true };
  return best.allow;
}

/** Extract <loc> values and whether the document is a sitemap index. */
export function parseSitemap(xml: string): { isIndex: boolean; locs: string[] } {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
  );
  return { isIndex, locs };
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, { signal, headers: { 'user-agent': `Mozilla/5.0 (compatible; ${USER_AGENT_TOKEN}/1.0)` }, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchRobots(origin: string, signal?: AbortSignal): Promise<RobotsRules> {
  const txt = await fetchText(new URL('/robots.txt', origin).href, signal);
  return txt ? parseRobots(txt) : { allow: [], disallow: [], sitemaps: [] };
}

/** Collect page URLs from robots-declared sitemaps (or /sitemap.xml), following sitemap indexes. */
export async function collectSitemapUrls(origin: string, robots: RobotsRules, limit: number, signal?: AbortSignal): Promise<string[]> {
  const queue = robots.sitemaps.length ? [...robots.sitemaps] : [new URL('/sitemap.xml', origin).href, new URL('/sitemap_index.xml', origin).href];
  const seenMaps = new Set<string>();
  const pages: string[] = [];
  while (queue.length && seenMaps.size < 50 && pages.length < limit * 3) {
    const sm = queue.shift()!;
    if (seenMaps.has(sm) || /\.gz$/i.test(sm)) continue;
    seenMaps.add(sm);
    const xml = await fetchText(sm, signal);
    if (!xml) continue;
    const { isIndex, locs } = parseSitemap(xml);
    if (isIndex) queue.push(...locs);
    else pages.push(...locs);
  }
  return pages;
}
