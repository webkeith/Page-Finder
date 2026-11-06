import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { extractHtml, launch, SAMPLE_HTML, toPage } from './helpers';
import { searchPage } from '@/lib/match';
import type { ExtractResult, Segment } from '@/lib/types';

let browser: Browser;
let r: ExtractResult;
beforeAll(async () => {
  browser = await launch();
  r = await extractHtml(browser, SAMPLE_HTML);
});
afterAll(() => browser?.close());

const find = (needle: string, kind: Segment['kind'] = 'text') => {
  const s = r.segments.find((x) => x.kind === kind && x.text.includes(needle));
  if (!s) throw new Error(`segment not found: ${needle}`);
  return s;
};

describe('visible vs hidden detection', () => {
  it('marks normal body text, headings and the submit button value as visible', () => {
    expect(find('request a refund within 30 days').visibility).toBe('visible');
    expect(find('Refund policy')).toMatchObject({ visibility: 'visible', inHeading: true });
    expect(find('Send refund request').visibility).toBe('visible');
    expect(find('Shipping is free').visibility).toBe('visible');
  });

  it.each([
    ['Old refund wording', 'display:none'],
    ['Ghost refund text', 'visibility:hidden'],
    ['Hidden attribute refund text', 'hidden attribute'],
    ['Aria hidden refund text', 'aria-hidden'],
    ['Screen reader refund hint', 'clipped (screen-reader only)'],
    ['Offscreen refund banner', 'off-screen'],
    ['Accordion answer', 'collapsed <details> (accordion)'],
    ['Returns tab', 'inactive tab (display:none)'],
  ])('"%s" is hidden (%s)', (needle, reason) => {
    expect(find(needle)).toMatchObject({ visibility: 'hidden', reason });
  });

  it('keeps the <summary> of a closed <details> visible', () => {
    expect(find('Refund FAQ').visibility).toBe('visible');
  });

  it('records the nearest heading for context', () => {
    expect(find('Send refund request').heading).toBe('Contact us');
  });

  it('ignores HTML comments unless enabled', async () => {
    expect(r.segments.some((s) => s.kind === 'comment')).toBe(false);
    const withComments = await extractHtml(browser, SAMPLE_HTML, true);
    expect(withComments.segments.find((s) => s.kind === 'comment')).toMatchObject({
      text: 'TODO: update refund wording before launch', visibility: 'hidden', reason: 'HTML comment',
    });
  });

  it('handles text rendered by JavaScript after load', async () => {
    const js = await extractHtml(browser, '<div id="x"></div><script>document.getElementById("x").textContent = "Injected refund notice";</script>');
    expect(js.segments.find((s) => s.text.includes('Injected refund notice'))?.visibility).toBe('visible');
  });
});

describe('placeholder matching and page counts', () => {
  it('extracts placeholders as placeholder segments', () => {
    expect(find('Search refunds and returns', 'placeholder').visibility).toBe('visible');
    expect(find('Join our newsletter', 'placeholder')).toMatchObject({ visibility: 'hidden', reason: 'field hidden: display:none' });
  });

  it('counts refund matches by label on the fixture page', () => {
    const res = searchPage(toPage(r), ['refund'], { wholeWord: false, exactPhrase: true });
    const c = res.counts.refund;
    // visible: h1, p, $5 line (refundable), FAQ summary, submit value = 5
    expect(c.visible).toBe(5);
    // hidden: display:none, visibility, hidden attr, aria-hidden, sr-only, off-screen, accordion, tab = 8
    expect(c.hidden).toBe(8);
    // placeholders: "Describe your refund request", "Search refunds and returns"
    expect(c.placeholder).toBe(2);
    expect(res.hits.filter((h) => h.label === 'placeholder').every((h) => h.keyword === 'refund')).toBe(true);
  });

  it('whole-word mode excludes "refunds"/"refundable"', () => {
    const res = searchPage(toPage(r), ['refund'], { wholeWord: true, exactPhrase: true });
    expect(res.counts.refund.total).toBeLessThan(15);
    expect(res.hits.some((h) => /refunds|refundable/i.test(h.snippet.match))).toBe(false);
  });
});
