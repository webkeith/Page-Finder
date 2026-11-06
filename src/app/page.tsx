'use client';

import { useEffect, useRef, useState } from 'react';
import { mergeKeywords, parseKeywords } from '@/lib/keywords';
import { FIELD_TYPES, FORM_PURPOSES } from '@/lib/forms';
import type { FormResult, PageResult, Recommendation, SkippedPage } from '@/lib/types';

type Tab = 'text' | 'forms';
interface JobState {
  id: string;
  key: string;
  status: 'running' | 'done' | 'cancelled' | 'error';
  source?: 'sitemap' | 'links';
  progress: { done: number; total: number; current: string };
  pagesScanned: number;
  skipped: SkippedPage[];
  error?: string;
}
interface SearchResult {
  keywords: string[];
  pages: PageResult[];
  recommendations: Recommendation[];
  forms: FormResult[];
  pagesScanned: number;
  status: string;
}

const LABEL_TEXT = { visible: 'Visible', hidden: 'Hidden', placeholder: 'Placeholder' } as const;

export default function Home() {
  const [siteUrl, setSiteUrl] = useState('');
  const [maxPages, setMaxPages] = useState(200);
  const [includeComments, setIncludeComments] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [exactPhrase, setExactPhrase] = useState(true);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [listText, setListText] = useState('');
  const [tab, setTab] = useState<Tab>('text');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('');
  const [job, setJob] = useState<JobState | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const crawlKey = `${siteUrl.trim()}|${maxPages}|${includeComments}`;
  const cached = job && job.key === crawlKey && (job.status === 'done' || job.status === 'cancelled');
  const running = job?.status === 'running';

  function addSingle() {
    const parsed = parseKeywords(kwInput);
    if (!parsed.length) return setMessage({ kind: 'error', text: 'Type a keyword first.' });
    setKeywords((k) => mergeKeywords(k, parsed));
    setKwInput('');
    setMessage(null);
  }
  function addList() {
    const parsed = parseKeywords(listText);
    if (!parsed.length) return setMessage({ kind: 'error', text: 'The list is empty. Put one keyword per line, or separate them with commas.' });
    const before = keywords.length;
    const next = mergeKeywords(keywords, parsed);
    setKeywords(next);
    setListText('');
    setListOpen(false);
    const added = next.length - before;
    const entered = listText.split(/[\n\r,]+/).filter((k) => k.trim()).length;
    const dupes = entered - added;
    setMessage({ kind: 'info', text: `Added ${added} keyword${added === 1 ? '' : 's'}${dupes ? ` (${dupes} duplicate${dupes === 1 ? '' : 's'} skipped)` : ''}.` });
  }

  function validate(): string | null {
    if (!siteUrl.trim()) return 'Enter the website address to scan.';
    if (tab === 'text' && !keywords.length) return 'Add at least one keyword before scanning. Blank or space-only entries are ignored.';
    if (tab === 'forms' && !formName.trim() && !formType) return 'Enter a form name or choose a form type before scanning.';
    return null;
  }

  async function runSearch(jobId: string) {
    const res = await fetch(`/api/scan/${jobId}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        keywords: tab === 'text' ? keywords : [],
        wholeWord,
        exactPhrase,
        form: tab === 'forms' ? { name: formName, type: formType } : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage({ kind: 'error', text: data.error ?? 'Search failed.' });
    setResult(data);
  }

  async function poll(id: string, key: string) {
    const res = await fetch(`/api/scan/${id}`);
    const data = await res.json();
    if (!res.ok) {
      setJob(null);
      return setMessage({ kind: 'error', text: data.error });
    }
    setJob({ ...data, key });
    if (data.status === 'running') {
      pollRef.current = setTimeout(() => poll(id, key), 1000);
      return;
    }
    if (data.status === 'error') return setMessage({ kind: 'error', text: `Scan failed: ${data.error}` });
    if (data.status === 'cancelled') setMessage({ kind: 'info', text: `Scan cancelled. Showing results from the ${data.pagesScanned} page(s) scanned so far.` });
    await runSearch(id);
  }

  async function onScan(forceNew = false) {
    const err = validate();
    if (err) return setMessage({ kind: 'error', text: err });
    setMessage(null);
    if (cached && !forceNew) return runSearch(job!.id);
    setResult(null);
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startUrl: siteUrl, maxPages, includeComments }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage({ kind: 'error', text: data.error });
    setJob({ id: data.id, key: crawlKey, status: 'running', progress: { done: 0, total: 0, current: '' }, pagesScanned: 0, skipped: [] });
    poll(data.id, crawlKey);
  }

  async function onCancel() {
    if (job) await fetch(`/api/scan/${job.id}`, { method: 'DELETE' });
  }

  const pct = job && job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : 0;

  return (
    <main>
      <h1>Page Finder</h1>
      <p className="lead">Got a task but no page? Enter a few words from the task and find where they appear on the site.</p>

      <section className="panel">
        <div className="row">
          <div className="field">
            <label htmlFor="site">Website to scan</label>
            <input id="site" type="url" placeholder="https://www.example.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </div>
          <div className="field narrow">
            <label htmlFor="max">Page limit</label>
            <input id="max" type="number" min={1} max={500} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} />
          </div>
        </div>
        <p className="small" style={{ margin: '8px 0 0' }}>
          Pages come from the site&apos;s sitemap (falls back to following links). Only scan sites you have permission to scan; pages blocked by robots.txt are skipped.
        </p>
      </section>

      <section className="panel">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'text'} onClick={() => setTab('text')}>Find text</button>
          <button role="tab" aria-selected={tab === 'forms'} onClick={() => setTab('forms')}>Find forms</button>
        </div>

        {tab === 'text' ? (
          <>
            <div className="row">
              <div className="field">
                <label htmlFor="kw">Keyword or phrase</label>
                <input id="kw" type="text" placeholder="e.g. refund" value={kwInput} onChange={(e) => setKwInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSingle()} />
              </div>
              <button onClick={addSingle}>Add</button>
              <button onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen}>Add list</button>
            </div>
            {listOpen && (
              <div style={{ marginTop: 12 }}>
                <label htmlFor="list">One keyword per line, or separated by commas</label>
                <textarea id="list" value={listText} onChange={(e) => setListText(e.target.value)} placeholder={'refund\nreturn policy, money back'} />
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="primary" onClick={addList}>Add all</button>
                  <button className="link" onClick={() => setListOpen(false)}>Close</button>
                </div>
              </div>
            )}
            {keywords.length > 0 && (
              <div className="chips">
                {keywords.map((k) => (
                  <span className="chip" key={k}>
                    {k}
                    <button aria-label={`Remove ${k}`} onClick={() => setKeywords((all) => all.filter((x) => x !== k))}>×</button>
                  </span>
                ))}
                <button className="link" onClick={() => setKeywords([])}>Clear all</button>
              </div>
            )}
            <div className="checks">
              <label><input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> Whole words only</label>
              <label><input type="checkbox" checked={exactPhrase} onChange={(e) => setExactPhrase(e.target.checked)} /> Exact phrase (untick to match all words in any order)</label>
              <label><input type="checkbox" checked={includeComments} onChange={(e) => setIncludeComments(e.target.checked)} /> Include HTML comments</label>
            </div>
          </>
        ) : (
          <div className="row">
            <div className="field">
              <label htmlFor="fname">Form name, id or label</label>
              <input id="fname" type="text" placeholder="e.g. newsletter" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ftype">Form type</label>
              <select id="ftype" value={formType} onChange={(e) => setFormType(e.target.value)}>
                <option value="">Any</option>
                <optgroup label="What the form is for">
                  {FORM_PURPOSES.map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
                <optgroup label="Contains a field of type">
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              </select>
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button className="primary" onClick={() => onScan()} disabled={running}>
            {cached ? `Search ${job!.pagesScanned} scanned pages` : 'Scan site'}
          </button>
          {cached && <button onClick={() => onScan(true)}>Re-scan site</button>}
          {running && <button onClick={onCancel}>Cancel</button>}
        </div>

        {running && job && (
          <div aria-live="polite">
            <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            <div className="small">
              {job.progress.total ? `Scanned ${job.progress.done} of ${job.progress.total} pages` : 'Reading sitemap…'}
              {job.source === 'links' && ' (no sitemap found; following links)'}
              {job.progress.current && <> · {job.progress.current}</>}
            </div>
          </div>
        )}
        {message && <div className={`msg ${message.kind}`} role="status">{message.text}</div>}
      </section>

      {result && tab === 'text' && <TextResults result={result} />}
      {result && tab === 'forms' && <FormResults result={result} />}
      {job && job.skipped.length > 0 && !running && (
        <section className="panel">
          <details>
            <summary>{job.skipped.length} page(s) skipped</summary>
            <table>
              <thead><tr><th>URL</th><th>Reason</th></tr></thead>
              <tbody>{job.skipped.map((s) => <tr key={s.url + s.reason}><td>{s.url}</td><td>{s.reason}</td></tr>)}</tbody>
            </table>
          </details>
        </section>
      )}
    </main>
  );
}

function TextResults({ result }: { result: SearchResult }) {
  if (!result.keywords.length) return null;
  if (!result.pages.length) {
    return (
      <section className="panel">
        <h2>No matches on {result.pagesScanned} scanned page(s)</h2>
        <ul className="small">
          <li>Try shorter or fewer words (e.g. &quot;refund&quot; instead of &quot;refund wording&quot;).</li>
          <li>Untick &quot;Exact phrase&quot; and &quot;Whole words only&quot;.</li>
          <li>Try synonyms the site might use (refund, return, money back).</li>
          <li>Check the skipped pages below; the text may be on a page that needs a login.</li>
        </ul>
      </section>
    );
  }
  return (
    <>
      {result.recommendations.length > 0 && (
        <section className="panel rec">
          <h2>Most likely page{result.recommendations.length > 1 ? 's' : ''}</h2>
          <p className="small" style={{ marginTop: -6 }}>Suggestions based on where and how often your keywords appear. Please confirm before editing.</p>
          <ol>
            {result.recommendations.map((r) => (
              <li key={r.url}>
                <strong>{r.title}</strong> <span className={`badge ${r.strength === 'strong' ? 'visible' : 'neutral'}`}>{r.strength === 'strong' ? 'Best match' : 'Possible'}</span>
                <div><a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></div>
                <ul>{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="small">{result.pages.length} page(s) with matches, out of {result.pagesScanned} scanned. Sorted by total matches.</p>
      {result.pages.map((p) => (
        <section className="panel" key={p.url}>
          <div className="page-head">
            <div>
              <h3>{p.title}</h3>
              <a href={p.url} target="_blank" rel="noreferrer">{p.url}</a>
            </div>
            <div className="count">{p.total}<div className="small">matches</div></div>
          </div>
          <div className="kw-counts">
            {Object.entries(p.counts).filter(([, c]) => c.total).map(([k, c]) => (
              <span key={k} className="badge neutral" title={`${c.visible} visible, ${c.hidden} hidden, ${c.placeholder} placeholder`}>
                {k}: {c.total}{c.hidden ? ` (${c.hidden} hidden)` : ''}{c.placeholder ? ` (${c.placeholder} placeholder)` : ''}
              </span>
            ))}
          </div>
          <details>
            <summary>Show where on the page</summary>
            {p.hits.map((h, i) => (
              <div className="hit" key={i}>
                <div>
                  <span className={`badge ${h.label}`}>{LABEL_TEXT[h.label]}</span>
                  <div className="meta">{h.keyword}</div>
                </div>
                <div>
                  <div>{h.snippet.before}<mark>{h.snippet.match}</mark>{h.snippet.after}</div>
                  <div className="meta">
                    {h.inHeading ? 'In a heading' : h.heading ? `Under heading: "${h.heading}"` : 'Near the top of the page'}
                    {h.reason && ` · ${h.reason}`}
                    {h.frame && ` · inside embedded frame ${h.frame}`}
                  </div>
                </div>
              </div>
            ))}
            {p.hitsTruncated && <p className="small">Showing the first 25 matches per keyword.</p>}
          </details>
        </section>
      ))}
    </>
  );
}

function FormResults({ result }: { result: SearchResult }) {
  if (!result.forms.length) {
    return (
      <section className="panel">
        <h2>No matching forms on {result.pagesScanned} scanned page(s)</h2>
        <p className="small">Try a shorter name, or pick a field type (e.g. &quot;email&quot;) instead of a form purpose.</p>
      </section>
    );
  }
  return (
    <>
      <p className="small">{result.forms.length} form(s) found.</p>
      {result.forms.map((f, i) => (
        <section className="panel" key={i}>
          <h3>{f.title}</h3>
          <a href={f.url} target="_blank" rel="noreferrer">{f.url}</a>
          <div className="kw-counts">
            {f.inferredTypes.map((t) => <span key={t} className="badge visible">looks like: {t}</span>)}
            {f.form.visibility === 'hidden' && <span className="badge hidden">Hidden on load</span>}
            {f.form.pseudo && <span className="badge neutral">Fields without a &lt;form&gt; tag</span>}
          </div>
          <dl className="attrs">
            {f.form.name && <><dt>name</dt><dd>{f.form.name}</dd></>}
            {f.form.id && <><dt>id</dt><dd>{f.form.id}</dd></>}
            {f.form.ariaLabel && <><dt>aria-label</dt><dd>{f.form.ariaLabel}</dd></>}
            {f.form.role && <><dt>role</dt><dd>{f.form.role}</dd></>}
            {f.form.action && <><dt>action</dt><dd>{f.form.action} ({f.form.method})</dd></>}
            {f.form.heading && <><dt>under heading</dt><dd>{f.form.heading}</dd></>}
            {f.form.frame && <><dt>in frame</dt><dd>{f.form.frame}</dd></>}
            <dt>matched on</dt><dd>{f.matchedOn.join('; ')}</dd>
          </dl>
          <table>
            <thead><tr><th>Type</th><th>Name / id</th><th>Label / placeholder</th><th>Required</th></tr></thead>
            <tbody>
              {f.form.fields.map((fd, j) => (
                <tr key={j}>
                  <td>{fd.type}</td>
                  <td>{[fd.name, fd.id && `#${fd.id}`].filter(Boolean).join(' ') || '—'}</td>
                  <td>{fd.label || fd.placeholder || '—'}</td>
                  <td>{fd.required ? 'yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
