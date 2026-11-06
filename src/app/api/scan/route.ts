import { NextResponse } from 'next/server';
import { startJob } from '@/lib/jobs';
import { normalizeStartUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PAGES_CAP = 500;

/** POST /api/scan — start a crawl. Body: { startUrl, maxPages?, includeComments?, timeoutSec? } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const startUrl = normalizeStartUrl(String(body.startUrl ?? ''));
  if (!startUrl) return NextResponse.json({ error: 'Enter a valid website address, e.g. https://www.example.com' }, { status: 400 });

  const maxPages = Math.min(MAX_PAGES_CAP, Math.max(1, Number(body.maxPages) || 200));
  const timeoutSec = Math.min(60, Math.max(5, Number(body.timeoutSec) || 20));
  const job = startJob({
    startUrl,
    maxPages,
    includeComments: !!body.includeComments,
    timeoutMs: timeoutSec * 1000,
    concurrency: 3,
  });
  return NextResponse.json({ id: job.id, startUrl, maxPages });
}
