import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { extractorCall } from '@/lib/extractor';
import type { ExtractResult, PageData } from '@/lib/types';

export const SAMPLE_HTML = readFileSync(path.join(__dirname, 'fixtures/sample.html'), 'utf8');

/** Render HTML in real Chromium and run the same extractor the crawler uses. */
export async function extractHtml(browser: Browser, html: string, includeComments = false): Promise<ExtractResult> {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return (await page.evaluate(extractorCall({ includeComments }))) as ExtractResult;
  } finally {
    await page.close();
  }
}

export function toPage(r: ExtractResult, url = 'https://example.com/refund-policy'): PageData {
  return { url, title: r.title, segments: r.segments, forms: r.forms, notes: [] };
}

export const launch = () => chromium.launch();
