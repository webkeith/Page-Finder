const NON_HTML = /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|gz|rar|7z|mp4|mp3|wav|mov|avi|docx?|xlsx?|pptx?|csv|json|xml|txt|css|js|woff2?|ttf|eot)$/i;
const TRACKING = /^(utm_\w+|gclid|fbclid|mc_cid|mc_eid|_ga)$/i;

/** Hostname without a leading "www." — www and bare domain count as the same site. */
export function siteKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function sameSite(a: string, b: string): boolean {
  try {
    return siteKey(new URL(a).hostname) === siteKey(new URL(b).hostname);
  } catch {
    return false;
  }
}

/** Canonical key used to de-duplicate URLs (drops hash, tracking params, trailing slash, www). */
export function urlKey(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
  return `${siteKey(u.hostname)}${u.port ? ':' + u.port : ''}${path}${u.search}`;
}

export function looksNonHtml(raw: string): boolean {
  try {
    return NON_HTML.test(new URL(raw).pathname);
  } catch {
    return true;
  }
}

export function normalizeStartUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}
