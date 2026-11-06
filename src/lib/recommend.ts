import type { PageResult, Recommendation } from './types';

interface Scored {
  r: PageResult;
  score: number;
  reasons: string[];
}

/**
 * Rank likely pages for the task. Signals: keywords matched, keyword in a heading,
 * keyword in the title or URL, and match count (visible weighted above hidden).
 * These are hints for a human to confirm, never certainties.
 */
export function recommendPages(results: PageResult[], keywords: string[], max = 3): Recommendation[] {
  if (!results.length) return [];
  const topCount = Math.max(...results.map((r) => r.total));

  const scored: Scored[] = results.map((r) => {
    const reasons: string[] = [];
    let score = 0;
    const matched = keywords.filter((k) => r.counts[k]?.total);
    score += matched.length * 10;
    if (keywords.length > 1) reasons.push(`Matches ${matched.length} of ${keywords.length} keywords`);

    const headingKws = matched.filter((k) => r.hits.some((h) => h.keyword === k && h.inHeading));
    if (headingKws.length) {
      score += headingKws.length * 6;
      const h = r.hits.find((x) => x.inHeading)!;
      const text = `${h.snippet.before}${h.snippet.match}${h.snippet.after}`.trim();
      reasons.push(`"${headingKws.join('", "')}" appears in a heading: "${text}"`);
    }
    const titleKws = matched.filter((k) => r.title.toLowerCase().includes(k.toLowerCase()));
    if (titleKws.length) {
      score += titleKws.length * 5;
      reasons.push(`Page title contains "${titleKws.join('", "')}"`);
    }
    const urlKws = matched.filter((k) => decodeURIComponent(r.url).toLowerCase().replace(/[-_]/g, ' ').includes(k.toLowerCase()));
    if (urlKws.length) {
      score += urlKws.length * 3;
      reasons.push(`URL contains "${urlKws.join('", "')}"`);
    }
    const visible = Object.values(r.counts).reduce((a, c) => a + c.visible + c.placeholder, 0);
    const hidden = Object.values(r.counts).reduce((a, c) => a + c.hidden, 0);
    score += Math.log2(1 + visible) * 3 + Math.log2(1 + hidden) * 1.5;
    if (r.total === topCount) reasons.push(`Highest number of matches (${r.total})`);
    else reasons.push(`${r.total} match${r.total === 1 ? '' : 'es'}`);
    if (visible === 0 && hidden > 0) reasons.push('All matches are hidden (collapsed section, tab, or unused markup) — open it on the page to confirm');
    return { r, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  return scored
    .filter((s, i) => i === 0 || s.score >= best * 0.6)
    .slice(0, max)
    .map((s, i) => ({
      url: s.r.url,
      title: s.r.title,
      strength: i === 0 && (scored.length === 1 || s.score >= scored[1].score * 1.25) ? 'strong' : 'possible',
      reasons: s.reasons,
    }));
}
