export type Visibility = 'visible' | 'hidden';
export type SegmentKind = 'text' | 'placeholder' | 'comment';
export type MatchLabel = 'visible' | 'hidden' | 'placeholder';

/** One block of text extracted from a rendered page. */
export interface Segment {
  text: string;
  kind: SegmentKind;
  visibility: Visibility;
  /** Why the text is hidden, e.g. "display:none", "collapsed <details>". */
  reason?: string;
  /** Nearest heading above this text (helps non-devs locate it on the page). */
  heading?: string;
  /** True when the segment itself is inside an h1–h6. */
  inHeading: boolean;
  /** Set when the text came from a same-site iframe. */
  frame?: string;
}

export interface FormField {
  tag: string;
  type: string;
  name?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  autocomplete?: string;
  required: boolean;
}

export interface FormInfo {
  name?: string;
  id?: string;
  ariaLabel?: string;
  role?: string;
  action?: string;
  method?: string;
  heading?: string;
  visibility: Visibility;
  /** True for fields grouped on the page without a <form> element. */
  pseudo: boolean;
  frame?: string;
  fields: FormField[];
}

export interface ExtractResult {
  title: string;
  segments: Segment[];
  forms: FormInfo[];
  links: string[];
}

export interface PageData {
  url: string;
  title: string;
  segments: Segment[];
  forms: FormInfo[];
  notes: string[];
}

export interface SkippedPage {
  url: string;
  reason: string;
}

export interface MatchOptions {
  wholeWord: boolean;
  /** true: keyword must appear as typed (contiguous). false: all words of the keyword in the same block. */
  exactPhrase: boolean;
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

export interface MatchHit {
  keyword: string;
  label: MatchLabel;
  reason?: string;
  heading?: string;
  inHeading: boolean;
  frame?: string;
  snippet: Snippet;
}

export interface PageResult {
  url: string;
  title: string;
  total: number;
  counts: Record<string, { visible: number; hidden: number; placeholder: number; total: number }>;
  hits: MatchHit[];
  hitsTruncated: boolean;
}

export interface Recommendation {
  url: string;
  title: string;
  strength: 'strong' | 'possible';
  reasons: string[];
}

export interface FormQuery {
  name?: string;
  type?: string;
}

export interface FormResult {
  url: string;
  title: string;
  form: FormInfo;
  inferredTypes: string[];
  matchedOn: string[];
}

export type JobStatus = 'running' | 'done' | 'cancelled' | 'error';

export interface ScanSettings {
  startUrl: string;
  maxPages: number;
  includeComments: boolean;
  timeoutMs: number;
  concurrency: number;
}
