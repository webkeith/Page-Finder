# Page Finder

Enter keywords from a task (for example "refund") and find which pages of a site contain them. It reports visible, hidden and placeholder text, suggests the most likely page, and can also find forms by name or type.

## Stack and why
- **Next.js 15 (App Router) + TypeScript**: a UI and API routes in one app, deployable as one Node process.
- **Playwright (Chromium)**: pages are rendered in a real browser so that JS-built content counts. Visibility is measured from computed CSS and layout boxes (display, visibility, opacity, clip, zero size, off-screen, `hidden`, `aria-hidden`, closed `<details>`, inactive tab panels). Static HTML parsers like cheerio can't do either of those.
- **Sitemap-first discovery**: URLs come from `robots.txt` sitemaps or `/sitemap.xml` (sitemap indexes are followed). If no sitemap exists, it follows same-site links from the start URL instead.
- **In-memory jobs**: one crawl can be searched again with new keywords or form filters without re-crawling. Jobs expire after 1 hour.

## Install and run
```bash
npm install                     # also downloads Chromium (postinstall). If that fails: npx playwright install chromium
npm run dev                     # http://localhost:3000
# production: npm run build && npm start
```
Linux servers may also need `npx playwright install-deps chromium`.

## Tests
```bash
npm test
```
| File | Covers |
|---|---|
| `tests/keywords.test.ts` | list parsing, commas/newlines, trimming, de-duplication, whitespace-only input |
| `tests/match.test.ts` | case-insensitive counting, whole word, exact phrase vs all words, special characters as plain text, snippets, sort order |
| `tests/visibility.test.ts` | visible vs hidden for all 8 hiding methods, comments only when enabled, JS-rendered text, placeholders, per-label counts (real Chromium) |
| `tests/forms.test.ts` | form extraction, purpose inference, search by name/id/aria-label and by type (login/search/contact/email/password) |
| `tests/sitemap.test.ts` | robots.txt rules, sitemap parsing, URL de-duplication, recommendations |
| `tests/crawler.test.ts` | full crawl of `fixtures/site`: redirects, duplicates, 403, login redirect, 404, timeout, robots block, PDF, off-site URL, same-site iframe |

Fixtures: `tests/fixtures/sample.html` (unit tests) and `fixtures/site/` (crawl test and manual check).

## Manual check (about 3 minutes)
1. Terminal A: `npm run fixture` (sample site at http://localhost:4000). Terminal B: `npm run dev`.
2. Open http://localhost:3000 and click **Scan site** with nothing filled in. You should see a message, and no scan should start.
3. Enter `http://localhost:4000`. Click **Add list** and paste `refund`, `Refund`, `returns`. Expect 2 chips and the note "1 duplicate skipped".
4. **Scan site**. A progress bar appears. The top suggestion should be **/refunds**, with its reasons listed. Expand "Show where on the page": the accordion and `display:none` lines are labelled **Hidden**. /contact shows a **Placeholder** match plus a match inside the iframe.
5. Open "7 page(s) skipped" and check the reasons: 403, login redirect, 404, timeout, robots.txt, PDF, redirect duplicate.
6. Switch to **Find forms**, set type `login`, and click **Search 5 scanned pages**. Only /login should appear, with no re-crawl.
7. Search for `zebra`. You should see a "No matches" panel with suggestions.
8. Click **Re-scan site**, then **Cancel** within a few seconds. The pages scanned so far are still shown.

## API
- `POST /api/scan` `{ startUrl, maxPages?=200 (max 500), includeComments?, timeoutSec?=20 }` → `{ id }`
- `GET /api/scan/:id` → status, progress, skipped
- `DELETE /api/scan/:id` → cancel
- `POST /api/scan/:id/search` `{ keywords[], wholeWord?, exactPhrase?=true, form?: { name?, type? } }` → pages, recommendations, forms

## Permission
Only scan sites you own or are allowed to scan. The crawler follows `robots.txt` (as `PageFinderBot`, otherwise `*`), stays on the start domain (www and the bare domain count as the same), and runs at most 3 pages at a time.
