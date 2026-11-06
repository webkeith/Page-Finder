import { chromium, type Browser, type BrowserContext, type Frame, type Page } from 'playwright';
import { extractorCall } from './extractor';
import { collectSitemapUrls, fetchRobots, isAllowed, USER_AGENT_TOKEN, type RobotsRules } from './sitemap';
import { looksNonHtml, sameSite, urlKey } from './url';
import type { ExtractResult, PageData, ScanSettings, SkippedPage } from './types';

export interface CrawlCallbacks {
  onDiscovered?: (total: number, source: 'sitemap' | 'links') => void;
  onPage?: (page: PageData) => void;
  onSkip?: (skip: SkippedPage) => void;
  onProgress?: (done: number, total: number, current: string) => void;
}

const LOGIN_PATH = /\/(login|log-in|signin|sign-in|sso|auth|account\/login|wp-login\.php)(\/|$|\?)/i;

/**
 * Sitemap-first crawl: URLs come from robots.txt sitemaps or /sitemap.xml. If none are found,
 * falls back to following same-site links from the start URL. Each page is rendered in Chromium
 * so JS-built content, computed CSS visibility and collapsed widgets are measured as the user sees them.
 */
export async function crawl(settings: ScanSettings, signal: AbortSignal, cb: CrawlCallbacks = {}): Promise<{ source: 'sitemap' | 'links' }> {
  const { startUrl, maxPages, includeComments, timeoutMs, concurrency } = settings;
  const origin = new URL(startUrl).origin;
  const robots: RobotsRules = await fetchRobots(origin, signal);

  const queued = new Set<string>();
  const scanned = new Set<string>();
  const queue: string[] = [];

  const enqueue = (raw: string): boolean => {
    const key = urlKey(raw);
    if (!key || queued.has(key) || !sameSite(raw, startUrl)) return false;
    if (queued.size >= maxPages) return false;
    queued.add(key);
    queue.push(raw.split('#')[0]);
    return true;
  };

  enqueue(startUrl);
  const fromSitemap = (await collectSitemapUrls(origin, robots, maxPages, signal)).filter((u) => sameSite(u, startUrl));
  fromSitemap.forEach(enqueue);
  const source: 'sitemap' | 'links' = fromSitemap.length ? 'sitemap' : 'links';
  cb.onDiscovered?.(queued.size, source);

  const skip = (url: string, reason: string) => {
    cb.onSkip?.({ url, reason });
  };

  let browser: Browser | null = null;
  const onAbort = () => browser?.close().catch(() => {});
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 ${USER_AGENT_TOKEN}/1.0`,
      javaScriptEnabled: true,
    });
    // Images/media/fonts don't affect text content; skipping them makes large scans much faster.
    await context.route('**/*', (route) =>
      ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue(),
    );

    let done = 0;
    let active = 0;
    // Workers keep polling while others are in flight, because link-crawl mode adds URLs as pages load.
    const worker = async () => {
      while (!signal.aborted) {
        const url = queue.shift();
        if (!url) {
          if (active === 0) return;
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        active++;
        cb.onProgress?.(done, queued.size, url);
        try {
          await scanOne(context, url);
        } finally {
          active--;
          done++;
          cb.onProgress?.(done, queued.size, url);
        }
      }
    };

    const scanOne = async (context: BrowserContext, url: string) => {
      const path = new URL(url).pathname + new URL(url).search;
      if (!isAllowed(robots, path)) return skip(url, 'Blocked by robots.txt');
      if (looksNonHtml(url)) return skip(url, 'Not an HTML page (file download)');

      let page: Page | null = null;
      try {
        page = await context.newPage();
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        // Give client-side rendering a moment; don't fail the page if the network never goes idle.
        await page.waitForLoadState('networkidle', { timeout: Math.min(8000, timeoutMs) }).catch(() => {});

        const finalUrl = page.url();
        const status = res?.status() ?? 0;
        if (status === 401 || status === 403) return skip(url, `Requires login or access denied (HTTP ${status})`);
        if (status >= 400) return skip(url, `HTTP error ${status}`);
        const ctype = res?.headers()['content-type'] ?? '';
        if (ctype && !/html/i.test(ctype)) return skip(url, `Not an HTML page (${ctype.split(';')[0]})`);
        if (!sameSite(finalUrl, startUrl)) return skip(url, `Redirected off-site to ${finalUrl}`);
        if (LOGIN_PATH.test(new URL(finalUrl).pathname) && !LOGIN_PATH.test(new URL(url).pathname)) {
          return skip(url, 'Redirected to a login page (requires login)');
        }
        const finalKey = urlKey(finalUrl)!;
        if (finalKey !== urlKey(url)) {
          if (scanned.has(finalKey) || queued.has(finalKey)) return skip(url, `Redirects to ${finalUrl} (scanned separately)`);
          queued.add(finalKey);
        }
        scanned.add(finalKey);

        const main = (await page.evaluate(extractorCall({ includeComments }))) as ExtractResult;
        const notes: string[] = [];
        if (finalUrl !== url) notes.push(`Redirected from ${url}`);
        const segments = [...main.segments];
        const forms = [...main.forms];
        for (const frame of page.frames()) {
          if (frame === page.mainFrame()) continue;
          await mergeFrame(frame, finalUrl, segments, forms, notes);
        }
        const data: PageData = { url: finalUrl, title: main.title || finalUrl, segments, forms, notes };
        cb.onPage?.(data);

        if (source === 'links') main.links.forEach(enqueue);
      } catch (err) {
        if (signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (/Timeout/i.test(msg)) skip(url, `Timed out after ${Math.round(timeoutMs / 1000)}s`);
        else skip(url, `Failed to load: ${msg.split('\n')[0]}`);
      } finally {
        await page?.close().catch(() => {});
      }
    };

    const mergeFrame = async (frame: Frame, pageUrl: string, segments: PageData['segments'], forms: PageData['forms'], notes: string[]) => {
      const src = frame.url();
      if (!src || src === 'about:blank') return;
      if (!sameSite(src, pageUrl)) {
        notes.push(`Iframe from another site not scanned: ${src}`);
        return;
      }
      try {
        const r = (await frame.evaluate(extractorCall({ includeComments, frame: src }))) as ExtractResult;
        segments.push(...r.segments);
        forms.push(...r.forms);
      } catch {
        notes.push(`Iframe could not be read: ${src}`);
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    return { source };
  } finally {
    signal.removeEventListener('abort', onAbort);
    await browser?.close().catch(() => {});
  }
}
