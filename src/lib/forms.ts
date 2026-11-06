import type { FormInfo, FormQuery, FormResult, PageData } from './types';

/** Purpose categories a user can pick in the UI. */
export const FORM_PURPOSES = ['login', 'signup', 'search', 'contact', 'newsletter', 'payment', 'upload'] as const;
/** Field types a user can pick in the UI. */
export const FIELD_TYPES = ['email', 'password', 'tel', 'text', 'textarea', 'select', 'file', 'date', 'number', 'checkbox', 'radio', 'url', 'search', 'hidden'] as const;

const has = (s: string | undefined, re: RegExp) => !!s && re.test(s);
const fieldText = (f: FormInfo['fields'][number]) => [f.name, f.id, f.label, f.placeholder, f.autocomplete].filter(Boolean).join(' ');

/** Best-effort guess at what a form is for. Heuristic — shown to the user as "looks like". */
export function inferFormTypes(form: FormInfo): string[] {
  const types = new Set<string>();
  const inputs = form.fields.filter((f) => !f.type.startsWith('button:') && !['submit', 'button', 'reset', 'image', 'hidden'].includes(f.type));
  const all = [form.name, form.id, form.ariaLabel, form.action, form.heading].filter(Boolean).join(' ');
  const passwords = inputs.filter((f) => f.type === 'password');
  const emails = inputs.filter((f) => f.type === 'email' || has(fieldText(f), /e-?mail/i));
  const textareas = inputs.filter((f) => f.type === 'textarea');
  const signupHint = /sign.?up|register|create.?account|join/i;

  if (passwords.length >= 2 || (passwords.length && (has(all, signupHint) || inputs.some((f) => has(fieldText(f), /confirm|repeat|new-password/i))))) {
    types.add('signup');
  } else if (passwords.length) {
    types.add('login');
  }
  if (
    form.role === 'search' ||
    inputs.some((f) => f.type === 'search') ||
    has(form.action, /search/i) ||
    (inputs.length === 1 && has(fieldText(inputs[0]), /^(q|s|query|search|keywords?)\b|search/i))
  ) {
    types.add('search');
  }
  if (textareas.length && (emails.length || inputs.some((f) => f.type === 'tel' || has(fieldText(f), /name|phone/i)))) {
    types.add('contact');
  }
  if (emails.length && !passwords.length && !textareas.length && inputs.length <= 3) types.add('newsletter');
  if (inputs.some((f) => has(f.autocomplete, /^cc-/) || has(fieldText(f), /card.?number|cvc|cvv|expir/i))) types.add('payment');
  if (inputs.some((f) => f.type === 'file')) types.add('upload');
  return [...types];
}

function nameMatches(form: FormInfo, q: string): string[] {
  const needle = q.trim().toLowerCase();
  const out: string[] = [];
  const check = (label: string, v?: string) => v && v.toLowerCase().includes(needle) && out.push(`${label} "${v}"`);
  check('name', form.name);
  check('id', form.id);
  check('aria-label', form.ariaLabel);
  return out;
}

function typeMatches(form: FormInfo, inferred: string[], q: string): string[] {
  const t = q.trim().toLowerCase();
  if (inferred.includes(t)) return [`looks like a ${t} form`];
  const fields = form.fields.filter((f) => f.type === t);
  return fields.length ? [`has ${fields.length} ${t} field${fields.length > 1 ? 's' : ''}`] : [];
}

/** Find forms by name/id/aria-label and/or by type (purpose or field type). Both filters must match when both are given. */
export function searchForms(pages: PageData[], query: FormQuery): FormResult[] {
  const name = query.name?.trim();
  const type = query.type?.trim();
  if (!name && !type) return [];
  const results: FormResult[] = [];
  for (const page of pages) {
    for (const form of page.forms) {
      const inferred = inferFormTypes(form);
      const byName = name ? nameMatches(form, name) : [];
      const byType = type ? typeMatches(form, inferred, type) : [];
      if (name && !byName.length) continue;
      if (type && !byType.length) continue;
      results.push({ url: page.url, title: page.title, form, inferredTypes: inferred, matchedOn: [...byName, ...byType] });
    }
  }
  return results;
}
