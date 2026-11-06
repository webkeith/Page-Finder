import type { MatchHit, MatchLabel, MatchOptions, PageData, PageResult, Segment, Snippet } from './types';

const MAX_HITS_PER_KEYWORD_PER_PAGE = 25;
const SNIPPET_RADIUS = 70;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Escape every regex metacharacter so user input is always treated as plain text. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a case-insensitive regex for one literal term. Whitespace in the term matches any whitespace run. */
export function buildTermRegex(term: string, wholeWord: boolean): RegExp {
  const body = term.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  const first = term.trim()[0] ?? '';
  const last = term.trim().slice(-1);
  const pre = wholeWord && WORD_CHAR.test(first) ? '(?<![\\p{L}\\p{N}_])' : '';
  const post = wholeWord && WORD_CHAR.test(last) ? '(?![\\p{L}\\p{N}_])' : '';
  return new RegExp(pre + body + post, 'giu');
}

export interface Occurrence {
  index: number;
  length: number;
}

/** Find occurrences of a keyword in one block of text. */
export function findOccurrences(text: string, keyword: string, opts: MatchOptions): Occurrence[] {
  const words = keyword.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (opts.exactPhrase || words.length === 1) {
    const re = buildTermRegex(keyword, opts.wholeWord);
    return [...text.matchAll(re)].map((m) => ({ index: m.index!, length: m[0].length }));
  }
  // All-words mode: the block counts once if it contains every word; anchor on the first word found.
  let firstHit: Occurrence | null = null;
  for (const w of words) {
    const m = buildTermRegex(w, opts.wholeWord).exec(text);
    if (!m) return [];
    if (!firstHit || m.index < firstHit.index) firstHit = { index: m.index, length: m[0].length };
  }
  return firstHit ? [firstHit] : [];
}

export function makeSnippet(text: string, occ: Occurrence, radius = SNIPPET_RADIUS): Snippet {
  let start = Math.max(0, occ.index - radius);
  let end = Math.min(text.length, occ.index + occ.length + radius);
  if (start > 0) {
    const sp = text.indexOf(' ', start);
    if (sp !== -1 && sp < occ.index) start = sp + 1;
  }
  if (end < text.length) {
    const sp = text.lastIndexOf(' ', end);
    if (sp > occ.index + occ.length) end = sp;
  }
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, occ.index),
    match: text.slice(occ.index, occ.index + occ.length),
    after: text.slice(occ.index + occ.length, end) + (end < text.length ? '…' : ''),
  };
}

export function labelFor(seg: Segment): MatchLabel {
  if (seg.kind === 'placeholder') return 'placeholder';
  return seg.visibility;
}

/** Search one page's segments for every keyword. */
export function searchPage(page: PageData, keywords: string[], opts: MatchOptions): PageResult {
  const counts: PageResult['counts'] = {};
  const hits: MatchHit[] = [];
  let truncated = false;
  let total = 0;

  for (const kw of keywords) {
    const c = { visible: 0, hidden: 0, placeholder: 0, total: 0 };
    let kept = 0;
    for (const seg of page.segments) {
      const occs = findOccurrences(seg.text, kw, opts);
      if (!occs.length) continue;
      const label = labelFor(seg);
      c[label] += occs.length;
      c.total += occs.length;
      for (const occ of occs) {
        if (kept >= MAX_HITS_PER_KEYWORD_PER_PAGE) {
          truncated = true;
          break;
        }
        kept++;
        hits.push({
          keyword: kw,
          label,
          reason: seg.reason,
          heading: seg.heading,
          inHeading: seg.inHeading,
          frame: seg.frame,
          snippet: makeSnippet(seg.text, occ),
        });
      }
    }
    counts[kw] = c;
    total += c.total;
  }
  return { url: page.url, title: page.title, total, counts, hits, hitsTruncated: truncated };
}

/** Search all pages; returns only pages with matches, sorted by total matches (desc). */
export function searchPages(pages: PageData[], keywords: string[], opts: MatchOptions): PageResult[] {
  return pages
    .map((p) => searchPage(p, keywords, opts))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.url.localeCompare(b.url));
}
