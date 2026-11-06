import { describe, expect, it } from 'vitest';
import { findOccurrences, makeSnippet, searchPage, searchPages } from '@/lib/match';
import type { PageData, Segment } from '@/lib/types';

const exact = { wholeWord: false, exactPhrase: true };
const seg = (text: string, extra: Partial<Segment> = {}): Segment => ({ text, kind: 'text', visibility: 'visible', inHeading: false, ...extra });
const page = (url: string, segments: Segment[]): PageData => ({ url, title: url, segments, forms: [], notes: [] });

describe('findOccurrences', () => {
  it('is case-insensitive and counts every occurrence', () =>
    expect(findOccurrences('Refund refund REFUND refunds', 'refund', exact)).toHaveLength(4));
  it('respects whole-word mode', () => {
    expect(findOccurrences('refund refunds prerefund', 'refund', { ...exact, wholeWord: true })).toHaveLength(1);
    expect(findOccurrences('art start', 'art', { ...exact, wholeWord: true })).toHaveLength(1);
  });
  it('treats special characters as plain text, not regex', () => {
    expect(findOccurrences('Costs $5.00 (USD) today', '$5.00 (USD)', exact)).toHaveLength(1);
    expect(findOccurrences('$5X00 USD', '$5.00', exact)).toHaveLength(0);
    expect(findOccurrences('Learn C++ and C', 'c++', exact)).toHaveLength(1);
    expect(findOccurrences('axb', 'a.b', exact)).toHaveLength(0);
    expect(findOccurrences('[a] (b) * ? \\ | ^', '(b) * ? \\', exact)).toHaveLength(1);
    expect(findOccurrences('C++ rocks', 'C++', { ...exact, wholeWord: true })).toHaveLength(1);
  });
  it('exact phrase needs words together; all-words mode does not', () => {
    const t = 'Our policy on any refund is simple';
    expect(findOccurrences(t, 'refund policy', exact)).toHaveLength(0);
    expect(findOccurrences(t, 'refund policy', { wholeWord: false, exactPhrase: false })).toHaveLength(1);
    expect(findOccurrences('refund   policy', 'refund policy', exact)).toHaveLength(1);
  });
});

describe('makeSnippet', () => {
  it('returns surrounding context with the match isolated', () => {
    const text = 'a '.repeat(100) + 'refund' + ' b'.repeat(100);
    const s = makeSnippet(text, findOccurrences(text, 'refund', exact)[0]);
    expect(s.match).toBe('refund');
    expect(s.before.startsWith('…')).toBe(true);
    expect(s.after.endsWith('…')).toBe(true);
  });
});

describe('counting', () => {
  it('counts per keyword and per label', () => {
    const r = searchPage(
      page('u', [
        seg('Refund now. refund later.'),
        seg('old refund text', { visibility: 'hidden', reason: 'display:none' }),
        seg('Search refunds', { kind: 'placeholder' }),
      ]),
      ['refund', 'missing'],
      exact,
    );
    expect(r.counts.refund).toEqual({ visible: 2, hidden: 1, placeholder: 1, total: 4 });
    expect(r.counts.missing.total).toBe(0);
    expect(r.total).toBe(4);
    expect(r.hits.map((h) => h.label)).toEqual(['visible', 'visible', 'hidden', 'placeholder']);
  });
  it('sorts pages by total matches and drops pages without matches', () => {
    const res = searchPages([page('a', [seg('refund')]), page('b', [seg('refund refund')]), page('c', [seg('nothing')])], ['refund'], exact);
    expect(res.map((r) => r.url)).toEqual(['b', 'a']);
  });
});
