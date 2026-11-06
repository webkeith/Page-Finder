import { NextResponse } from 'next/server';
import { cancelJob, getJob } from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/scan/:id — progress + skipped pages (polled by the UI). */
export async function GET(_req: Request, { params }: Ctx) {
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: 'Scan not found or expired. Start a new scan.' }, { status: 404 });
  return NextResponse.json({
    id: job.id,
    status: job.status,
    source: job.source,
    startUrl: job.settings.startUrl,
    progress: job.progress,
    pagesScanned: job.pages.length,
    skipped: job.skipped,
    error: job.error,
  });
}

/** DELETE /api/scan/:id — cancel a running scan. Pages scanned so far stay searchable. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const job = cancelJob((await params).id);
  if (!job) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  return NextResponse.json({ status: job.status });
}
