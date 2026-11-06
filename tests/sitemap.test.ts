import { describe, expect, it } from 'vitest';
import { isAllowed, parseRobots, parseSitemap } from '@/lib/sitemap';
import { urlKey, sameSite } from '@/lib/url';
import { recommendPages } from '@/lib/recommend';
import { searchPages } from '@/lib/match';

describe('robots.txt', () => {
  const rules = parseRobots(`User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\nAllow: /private/public-page\nDisallow: /*.pdf$\nSitemap: https://ex.com/sm.xml`);
  it('uses the * group and collects sitemaps', () => expect(rules.sitemaps).toEqual(['https://ex.com/sm.xml']));
  it('applies longest-match allow/disallow', () => {
    expect(isAllowed(rules, '/about')).toBe(true);
    expect(isAllowed(rules, '/private/x')).toBe(false);
    expect(isAllowed(rules, '/private/public-page')).toBe(true);
    expect(isAllowed(rules, '/files/a.pdf')).toBe(false);
  });
});

describe('sitemap parsing', () => {
  it('reads urlset locs and decodes entities', () =>
    expect(parseSitemap('<urlset><url><loc> https://ex.com/a?x=1&amp;y=2 </loc></url><url><loc><![CDATA[https://ex.com/b]]></loc></url></urlset>')).toEqual({
      isIndex: false, locs: ['https://ex.com/a?x=1&y=2', 'https://ex.com/b'],
    }));
  it('detects sitemap indexes', () => expect(parseSitemap('<sitemapindex><sitemap><loc>https://ex.com/s1.xml</loc></sitemap></sitemapindex>').isIndex).toBe(true));
});

describe('URL de-duplication', () => {
  it('treats hash, trailing slash, www and tracking params as the same page', () => {
    const k = urlKey('https://ex.com/a');
    expect(urlKey('https://www.ex.com/a/#top')).toBe(k);
    expect(urlKey('https://ex.com/a?utm_source=x')).toBe(k);
    expect(sameSite('https://www.ex.com', 'https://ex.com/x')).toBe(true);
    expect(sameSite('https://ex.com', 'https://other.com')).toBe(false);
  });
});

describe('recommendations', () => {
  it('prefers pages matching more keywords and headings', () => {
    const pages = [
      { url: 'https://ex.com/blog', title: 'Blog', notes: [], forms: [], segments: [{ text: 'refund refund refund refund', kind: 'text' as const, visibility: 'visible' as const, inHeading: false }] },
      { url: 'https://ex.com/refund-policy', title: 'Refund policy', notes: [], forms: [], segments: [
        { text: 'Refund policy', kind: 'text' as const, visibility: 'visible' as const, inHeading: true },
        { text: 'Returns accepted for a refund', kind: 'text' as const, visibility: 'visible' as const, inHeading: false },
      ] },
    ];
    const kws = ['refund', 'returns'];
    const recs = recommendPages(searchPages(pages, kws, { wholeWord: false, exactPhrase: true }), kws);
    expect(recs[0].url).toBe('https://ex.com/refund-policy');
    expect(recs[0].reasons.join(' ')).toMatch(/heading/);
  });
});
