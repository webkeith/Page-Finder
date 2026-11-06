import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
// @ts-expect-error plain ESM helper without types
import { createFixtureServer } from '../scripts/fixture-server.mjs';
import { crawl } from '@/lib/crawler';
import { searchPages } from '@/lib/match';
import { searchForms } from '@/lib/forms';
import type { PageData, SkippedPage } from '@/lib/types';

let srv: { server: import('node:http').Server; close: () => Promise<void> };
let origin = '';
const pages: PageData[] = [];
const skipped: SkippedPage[] = [];

beforeAll(async () => {
  srv = createFixtureServer();
  await new Promise<void>((r) => srv.server.listen(0, '127.0.0.1', () => r()));
  origin = `http://localhost:${(srv.server.address() as AddressInfo).port}`;
  await crawl(
    { startUrl: origin + '/', maxPages: 50, includeComments: false, timeoutMs: 5000, concurrency: 3 },
    new AbortController().signal,
    { onPage: (p) => pages.push(p), onSkip: (s) => skipped.push(s) },
  );
}, 60_000);
afterAll(() => srv?.close());

const reasonFor = (path: string) => skipped.find((s) => new URL(s.url).pathname === path)?.reason;

describe('crawler against the sample site', () => {
  it('scans each real page once (sitemap-driven, duplicates and redirects collapsed)', () => {
    const paths = pages.map((p) => new URL(p.url).pathname).sort();
    expect(paths).toEqual(['/', '/app', '/contact', '/login', '/refunds']);
  });

  it('lists skipped pages with reasons', () => {
    expect(reasonFor('/members')).toMatch(/Requires login or access denied \(HTTP 403\)/);
    expect(reasonFor('/account')).toMatch(/login page/);
    expect(reasonFor('/missing')).toBe('HTTP error 404');
    expect(reasonFor('/slow')).toMatch(/Timed out/);
    expect(reasonFor('/private/secret')).toBe('Blocked by robots.txt');
    expect(reasonFor('/guide.pdf')).toMatch(/Not an HTML page/);
    expect(reasonFor('/old-refunds')).toMatch(/Redirects to .*\/refunds/);
    expect(skipped.some((s) => s.url.includes('other-site'))).toBe(false);
  });

  it('finds JS-rendered, hidden and iframe text', () => {
    const res = searchPages(pages, ['refund'], { wholeWord: false, exactPhrase: true });
    const byPath = Object.fromEntries(res.map((r) => [new URL(r.url).pathname, r]));
    expect(byPath['/refunds'].counts.refund.hidden).toBe(2); // accordion + display:none (comment excluded)
    expect(byPath['/app'].counts.refund).toMatchObject({ visible: 1, hidden: 1 });
    expect(byPath['/contact'].hits.some((h) => h.frame?.endsWith('/embed'))).toBe(true);
    expect(byPath['/contact'].counts.refund.placeholder).toBe(1);
    expect(res[0].url).toBe(origin + '/refunds');
  });

  it('finds forms across pages', () => {
    expect(searchForms(pages, { type: 'login' }).map((f) => new URL(f.url).pathname)).toEqual(['/login']);
    expect(searchForms(pages, { name: 'contact' })[0].form.fields.map((f) => f.name)).toEqual(['name', 'email', 'message', undefined]);
  });
});
