import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { extractHtml, launch, SAMPLE_HTML, toPage } from './helpers';
import { inferFormTypes, searchForms } from '@/lib/forms';
import type { PageData } from '@/lib/types';

let browser: Browser;
let pages: PageData[];
beforeAll(async () => {
  browser = await launch();
  pages = [toPage(await extractHtml(browser, SAMPLE_HTML))];
});
afterAll(() => browser?.close());

const ids = (q: Parameters<typeof searchForms>[1]) => searchForms(pages, q).map((r) => r.form.id ?? r.form.name ?? r.form.ariaLabel ?? (r.form.pseudo ? 'pseudo' : '?'));

describe('form extraction', () => {
  it('finds every form, role=search container and loose fields', () => {
    const forms = pages[0].forms;
    expect(forms).toHaveLength(5);
    const contact = forms.find((f) => f.id === 'contact-form')!;
    expect(contact).toMatchObject({ name: 'contact', action: '/contact', method: 'post', heading: 'Contact us', visibility: 'visible' });
    expect(contact.fields.map((f) => f.type)).toEqual(['text', 'email', 'textarea', 'submit']);
    expect(contact.fields[1]).toMatchObject({ name: 'email', label: 'Email', required: true });
    expect(forms.find((f) => f.id === 'newsletter')!.visibility).toBe('hidden');
    expect(forms.find((f) => f.pseudo)!.fields[0].name).toBe('coupon');
  });

  it('infers purposes', () => {
    const byId = (id: string) => pages[0].forms.find((f) => f.id === id || f.ariaLabel === id)!;
    expect(inferFormTypes(byId('contact-form'))).toContain('contact');
    expect(inferFormTypes(byId('login-form'))).toEqual(['login']);
    expect(inferFormTypes(byId('Site search'))).toEqual(['search']);
    expect(inferFormTypes(byId('newsletter'))).toContain('newsletter');
  });
});

describe('searchForms', () => {
  it('searches by name, id and aria-label (case-insensitive substring)', () => {
    expect(ids({ name: 'CONTACT' })).toEqual(['contact-form']);
    expect(ids({ name: 'login-form' })).toEqual(['login-form']);
    expect(ids({ name: 'customer login' })).toEqual(['login-form']);
    expect(ids({ name: 'newsletter-signup' })).toEqual(['newsletter']);
    expect(ids({ name: 'nope' })).toEqual([]);
  });

  it('searches by purpose type', () => {
    expect(ids({ type: 'login' })).toEqual(['login-form']);
    expect(ids({ type: 'search' })).toEqual(['Site search']);
    expect(ids({ type: 'contact' })).toEqual(['contact-form']);
  });

  it('searches by input type', () => {
    expect(ids({ type: 'password' })).toEqual(['login-form']);
    expect(ids({ type: 'email' })).toEqual(['contact-form', 'login-form', 'newsletter']);
    expect(searchForms(pages, { type: 'email' })[0].matchedOn).toEqual(['has 1 email field']);
  });

  it('requires both filters when both are given, and nothing when neither is', () => {
    expect(ids({ name: 'login', type: 'email' })).toEqual(['login-form']);
    expect(ids({ name: 'contact', type: 'password' })).toEqual([]);
    expect(ids({})).toEqual([]);
  });
});
