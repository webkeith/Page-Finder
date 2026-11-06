import { randomUUID } from 'node:crypto';
import { crawl } from './crawler';
import type { JobStatus, PageData, ScanSettings, SkippedPage } from './types';

export interface Job {
  id: string;
  settings: ScanSettings;
  status: JobStatus;
  source?: 'sitemap' | 'links';
  progress: { done: number; total: number; current: string };
  pages: PageData[];
  skipped: SkippedPage[];
  error?: string;
  createdAt: number;
  controller: AbortController;
}

const TTL_MS = 60 * 60 * 1000;
const g = globalThis as unknown as { __pageFinderJobs?: Map<string, Job> };
const jobs = (g.__pageFinderJobs ??= new Map<string, Job>());

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.createdAt > TTL_MS && j.status !== 'running') jobs.delete(id);
}

export function startJob(settings: ScanSettings): Job {
  sweep();
  const job: Job = {
    id: randomUUID(),
    settings,
    status: 'running',
    progress: { done: 0, total: 0, current: '' },
    pages: [],
    skipped: [],
    createdAt: Date.now(),
    controller: new AbortController(),
  };
  jobs.set(job.id, job);

  crawl(settings, job.controller.signal, {
    onDiscovered: (total, source) => {
      job.progress.total = total;
      job.source = source;
    },
    onPage: (p) => job.pages.push(p),
    onSkip: (s) => job.skipped.push(s),
    onProgress: (done, total, current) => (job.progress = { done, total, current }),
  })
    .then(() => {
      if (job.status === 'running') job.status = job.controller.signal.aborted ? 'cancelled' : 'done';
    })
    .catch((err) => {
      if (job.controller.signal.aborted) job.status = 'cancelled';
      else {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : String(err);
      }
    });
  return job;
}

export const getJob = (id: string) => jobs.get(id);

export function cancelJob(id: string): Job | undefined {
  const job = jobs.get(id);
  if (job && job.status === 'running') {
    job.status = 'cancelled';
    job.controller.abort();
  }
  return job;
}
