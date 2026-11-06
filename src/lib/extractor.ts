/**
 * Runs INSIDE the rendered page (via Playwright `evaluate`). Kept as a plain JS string so
 * bundlers/transpilers can't inject helpers that don't exist in the browser.
 * Usage: page.evaluate(EXTRACTOR_SOURCE + '(' + JSON.stringify(opts) + ')')
 *
 * Returns { title, segments, forms, links } — see ExtractResult in types.ts.
 */
export const EXTRACTOR_SOURCE = String.raw`(function (opts) {
  var includeComments = !!(opts && opts.includeComments);
  var frameLabel = (opts && opts.frame) || undefined;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 0, HEAD: 1, IFRAME: 1, OBJECT: 1 };
  var HEADING = /^H[1-6]$/;
  var docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  var reasonCache = new Map();

  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  // Why is this element (or an ancestor) hidden? Returns a reason string or '' when rendered.
  function hiddenReason(el) {
    if (!el || el.nodeType !== 1) return '';
    if (reasonCache.has(el)) return reasonCache.get(el);
    var r = ownReason(el);
    if (!r) {
      var parent = el.parentElement || (el.parentNode && el.parentNode.host) || null;
      if (parent && el.tagName !== 'SUMMARY' && parent.tagName === 'DETAILS' && !parent.open) {
        r = 'collapsed <details> (accordion)';
      }
      if (!r && parent) r = hiddenReason(parent);
    }
    reasonCache.set(el, r);
    return r;
  }

  function ownReason(el) {
    if (el.hasAttribute('hidden')) return 'hidden attribute';
    if (el.getAttribute('aria-hidden') === 'true') return 'aria-hidden';
    if (el.tagName === 'OPTION' || el.tagName === 'OPTGROUP' || el.tagName === 'BODY' || el.tagName === 'HTML') return '';
    var cs = getComputedStyle(el);
    if (cs.display === 'none') {
      var role = el.getAttribute('role');
      if (role === 'tabpanel') return 'inactive tab (display:none)';
      return 'display:none';
    }
    if (cs.contentVisibility === 'hidden') return 'content-visibility:hidden';
    if (parseFloat(cs.opacity) === 0) return 'opacity:0';
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || /inset\(50%\)|circle\(0/.test(cs.clipPath)) return 'clipped (screen-reader only)';
    // No boxes at all means an ancestor is display:none — let the ancestor walk name the real reason.
    if ((cs.overflow === 'hidden' || cs.overflow === 'clip') && cs.display !== 'inline' && el.getClientRects().length) {
      var b = el.getBoundingClientRect();
      if (b.width <= 1 || b.height <= 1) return 'zero size';
    }
    return '';
  }

  // Visibility checks that depend on the text's own box (visibility can be overridden by children).
  function textReason(node, el) {
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return 'visibility:hidden';
    if (el.closest('select')) return '';
    var range = document.createRange();
    range.selectNodeContents(node);
    var rects = range.getClientRects();
    if (!rects.length) return 'zero size';
    var any = false, onScreen = false;
    for (var i = 0; i < rects.length; i++) {
      var rc = rects[i];
      if (rc.width > 0 && rc.height > 0) {
        any = true;
        var left = rc.left + window.scrollX, top = rc.top + window.scrollY;
        if (left + rc.width > 0 && top + rc.height > 0 && left < docW) onScreen = true;
      }
    }
    if (!any) return 'zero size';
    if (!onScreen) return 'off-screen';
    return '';
  }

  var INLINE = { inline: 1, 'inline-block': 1, contents: 1, 'inline-flex': 1, ruby: 1 };
  function blockOf(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var d = getComputedStyle(cur).display;
      if (!INLINE[d]) return cur;
      cur = cur.parentElement || (cur.parentNode && cur.parentNode.host);
    }
    return el;
  }

  var segments = [];
  var segIndex = new Map();
  var currentHeading;
  var forms = [];
  var formEls = [];

  function push(el, text, kind, vis, reason) {
    var block = kind === 'text' ? blockOf(el) : el;
    var inHeading = !!(el.closest && el.closest('h1,h2,h3,h4,h5,h6'));
    var key = kind + '|' + vis + '|' + (reason || '');
    var bucket = segIndex.get(block);
    if (!bucket) { bucket = {}; segIndex.set(block, bucket); }
    var seg = kind === 'text' ? bucket[key] : null;
    if (seg) { seg.text += text; return; }
    seg = { text: text, kind: kind, visibility: vis, reason: reason || undefined, heading: currentHeading, inHeading: inHeading, frame: frameLabel };
    if (kind === 'text') bucket[key] = seg;
    segments.push(seg);
  }

  function visitText(node) {
    var raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    var el = node.parentElement;
    if (!el) return;
    var reason = hiddenReason(el) || textReason(node, el);
    push(el, raw, 'text', reason ? 'hidden' : 'visible', reason);
  }

  function visit(node) {
    if (node.nodeType === 3) return visitText(node);
    if (node.nodeType === 8) {
      if (includeComments && node.nodeValue && node.nodeValue.trim()) {
        var host = node.parentElement || document.body;
        segments.push({ text: norm(node.nodeValue), kind: 'comment', visibility: 'hidden', reason: 'HTML comment', heading: currentHeading, inHeading: false, frame: frameLabel });
      }
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11 && node.nodeType !== 9) return;
    if (node.nodeType === 1) {
      var el = node;
      if (SKIP_TAGS[el.tagName]) return;
      if (HEADING.test(el.tagName)) {
        var ht = norm(el.textContent);
        if (ht) currentHeading = ht;
      }
      if (el.tagName === 'FORM' || el.getAttribute('role') === 'search' || el.getAttribute('role') === 'form') {
        if (!el.closest('form') || el.tagName === 'FORM') formEls.push({ el: el, heading: currentHeading });
      }
      if (el.hasAttribute('placeholder') && norm(el.getAttribute('placeholder'))) {
        var pr = hiddenReason(el);
        push(el, norm(el.getAttribute('placeholder')), 'placeholder', pr ? 'hidden' : 'visible', pr ? 'field hidden: ' + pr : undefined);
      }
      if (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type) && norm(el.value)) {
        var br = hiddenReason(el);
        push(el, norm(el.value), 'text', br ? 'hidden' : 'visible', br || undefined);
      }
      if (el.shadowRoot) visit(el.shadowRoot);
    }
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) visit(kids[i]);
  }

  visit(document.body || document.documentElement);

  segments.forEach(function (s) { s.text = norm(s.text); });
  segments = segments.filter(function (s) { return s.text; });

  // ---- Forms ----
  function labelText(field) {
    var t = '';
    if (field.labels && field.labels.length) t = norm(field.labels[0].textContent);
    if (!t) t = norm(field.getAttribute('aria-label'));
    if (!t) {
      var lb = field.getAttribute('aria-labelledby');
      if (lb) t = norm(lb.split(/\s+/).map(function (id) { var n = document.getElementById(id); return n ? n.textContent : ''; }).join(' '));
    }
    return t || undefined;
  }
  function fieldInfo(f) {
    var tag = f.tagName.toLowerCase();
    var type = tag === 'input' ? (f.getAttribute('type') || 'text').toLowerCase() : tag === 'button' ? 'button:' + (f.getAttribute('type') || 'submit').toLowerCase() : tag;
    return {
      tag: tag, type: type,
      name: f.getAttribute('name') || undefined,
      id: f.id || undefined,
      label: labelText(f) || (tag === 'button' ? norm(f.textContent) || undefined : undefined),
      placeholder: f.getAttribute('placeholder') || undefined,
      autocomplete: f.getAttribute('autocomplete') || undefined,
      required: !!f.required,
    };
  }
  function ariaLabel(el) {
    var a = norm(el.getAttribute('aria-label'));
    if (a) return a;
    var lb = el.getAttribute('aria-labelledby');
    if (lb) return norm(lb.split(/\s+/).map(function (id) { var n = document.getElementById(id); return n ? n.textContent : ''; }).join(' ')) || undefined;
    return undefined;
  }
  var FIELD_SEL = 'input, select, textarea, button';
  formEls.forEach(function (entry) {
    var el = entry.el;
    var fields = Array.prototype.slice.call(el.tagName === 'FORM' ? el.elements : el.querySelectorAll(FIELD_SEL));
    var r = hiddenReason(el);
    forms.push({
      name: el.getAttribute('name') || undefined,
      id: el.id || undefined,
      ariaLabel: ariaLabel(el),
      role: el.getAttribute('role') || undefined,
      action: el.tagName === 'FORM' ? (el.getAttribute('action') || undefined) : undefined,
      method: el.tagName === 'FORM' ? (el.getAttribute('method') || 'get').toLowerCase() : undefined,
      heading: entry.heading,
      visibility: r ? 'hidden' : 'visible',
      pseudo: false,
      frame: frameLabel,
      fields: fields.map(fieldInfo),
    });
  });
  // Inputs that live outside any <form>/role=search container (common in JS apps).
  var loose = Array.prototype.slice.call(document.querySelectorAll(FIELD_SEL)).filter(function (f) {
    if (f.form || f.closest('form,[role=search],[role=form]')) return false;
    if (f.tagName === 'BUTTON') return false;
    if (f.tagName === 'INPUT' && /^(hidden|submit|button|reset|image)$/i.test(f.type)) return false;
    return !hiddenReason(f);
  });
  if (loose.length) {
    forms.push({ name: undefined, id: undefined, ariaLabel: undefined, role: undefined, action: undefined, method: undefined,
      heading: undefined, visibility: 'visible', pseudo: true, frame: frameLabel, fields: loose.map(fieldInfo) });
  }

  var links = Array.prototype.slice.call(document.querySelectorAll('a[href]')).map(function (a) { return a.href; });

  return { title: norm(document.title), segments: segments, forms: forms, links: links };
})`;

export function extractorCall(opts: { includeComments: boolean; frame?: string }): string {
  return EXTRACTOR_SOURCE + '(' + JSON.stringify(opts) + ')';
}
