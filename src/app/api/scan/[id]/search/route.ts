import { NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';
import { mergeKeywords } from '@/lib/keywords';
import { searchPages } from '@/lib/match';
import { recommendPages } from '@/lib/recommend';
import { searchForms } from '@/lib/forms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/scan/:id/search — query the pages already scanned (no re-crawl).
 * Body: { keywords: string[], wholeWord?, exactPhrase?, form?: { name?, type? } }
 */
export async function POST(req: Request, { params }: Ctx) {
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: 'Scan not found or expired. Start a new scan.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  const keywords = mergeKeywords([], Array.isArray(body.keywords) ? body.keywords.map(String) : []);
  const form = body.form && (body.form.name?.trim() || body.form.type?.trim()) ? body.form : null;
  if (!keywords.length && !form) {
    return NextResponse.json({ error: 'Add at least one keyword (or a form name/type) to search.' }, { status: 400 });
  }

  const opts = { wholeWord: !!body.wholeWord, exactPhrase: body.exactPhrase !== false };
  const pages = keywords.length ? searchPages(job.pages, keywords, opts) : [];
  return NextResponse.json({
    status: job.status,
    pagesScanned: job.pages.length,
    keywords,
    pages,
    recommendations: recommendPages(pages, keywords),
    forms: form ? searchForms(job.pages, form) : [],
  });
}
