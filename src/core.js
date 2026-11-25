'use strict';
/* ============================== CORE ============================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ICONS = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  bold: 'M6 12h9a4 4 0 0 1 0 8H6V4h8a4 4 0 0 1 0 8',
  italic: 'M19 4h-9M14 20H5M15 4 9 20',
  underline: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16',
  strike: 'M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16',
  sup: 'm4 19 8-8m0 8-8-8m16 1h-4c0-1.5.44-2 1.5-2.5S20 8.33 20 7c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07',
  sub: 'm4 5 8 8m0-8-8 8m16 6h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07',
  alignL: 'M15 12H3M17 18H3M21 6H3',
  alignC: 'M17 12H7M19 18H5M21 6H3',
  alignR: 'M21 12H9M21 18H7M21 6H3',
  alignJ: 'M3 12h18M3 18h18M3 6h18',
  list: 'M3.5 6h.01M3.5 12h.01M3.5 18h.01M8 6h13M8 12h13M8 18h13',
  olist: 'M10 6h11M10 12h11M10 18h11M4 10h2M4 6h1v4M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  outdent: 'M21 12H11M21 18H11M21 6H11M7 8l-4 4 4 4',
  indent: 'M21 12H11M21 18H11M21 6H11M3 8l4 4-4 4',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  code: 'm16 18 6-6-6-6M8 6l-6 6 6 6',
  quote: 'M6 17h3l2-4V7H5v6h3M14 17h3l2-4V7h-6v6h3',
  table: 'M3 4h18v16H3zM3 10h18M3 15h18M9 4v16',
  heading: 'M6 4v16M18 4v16M6 12h12',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  marker: 'm9 11-6 6v3h9l3-3m7-5-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  bucket:
    'm19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0zM5 2l5 5M2 13h15M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4',
  drop: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5.5 12 3c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z',
  clearFmt: 'M4 7V4h16v3M5 20h6M13 4 8 20M15 15l5 5M20 15l-5 5',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  chev: 'm6 9 6 6 6-6',
  up: 'm18 15-6-6-6 6',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  fCompare:
    'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 2v20M6 8h3M6 12h3M15 12h3M15 16h3',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm10 17-4.3-4.3',
  rotL: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5',
  rotR: 'M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5',
  flipH:
    'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 2v2M12 8v2M12 14v2M12 20v2',
  flipV:
    'M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3M2 12h2M8 12h2M14 12h2M20 12h2',
  play: 'M7 4v16l13-8z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  upload: 'M12 15V3m-5 5 5-5 5 5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  fDoc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  fPdf: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M8.5 17.5c2-3 3-5.5 3.5-5.5s.3 3 3.5 3.5',
  fSlides: 'M3 4h18M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4M12 16v4M8 20h8',
  fSheet: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 9h16M4 15h16M10 3v18',
  fText: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M10 13l-2 2 2 2M14 17l2-2-2-2',
  fConvert: 'M4 7h13l-4-4M20 17H7l4 4',
  fAddon: 'M12 3v18M3 12h18M5 5h14v14H5z',
  ai: 'M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  fImg: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM21 15l-5-5L5 21M9 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
};
const icon = (n) =>
  `<svg class="i i-${n}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`;
const paintIcons = (root = document) =>
  $$('[data-i]', root).forEach((e) => {
    if (!e.querySelector(':scope > svg.i')) e.insertAdjacentHTML('afterbegin', icon(e.dataset.i));
  });

const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ext = (n) => (n.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
const base = (n) => n.replace(/\.[^.]+$/, '');
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat())
    if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const readAs = (file, how) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    how === 'text'
      ? fr.readAsText(file)
      : how === 'url'
        ? fr.readAsDataURL(file)
        : fr.readAsArrayBuffer(file);
  });
const blobToDataURL = (b) => readAs(b, 'url');
function dataURLtoBytes(u) {
  const b64 = u.split(',')[1] || '';
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Image failed to load'));
    i.src = src;
  });
}
// Keys keep the old 'folio.' prefix so drafts saved before the rename still load.
const store = {
  get(k) {
    try {
      const v = localStorage.getItem('folio.' + k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('folio.' + k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
};
// Versions 1-3 kept drafts under 'doc', 'sheet' and 'text'. Move them to the current keys unless a
// newer draft exists; the old key is removed only after the copy succeeded.
['doc', 'sheet', 'text'].forEach((k) => {
  try {
    const old = localStorage.getItem('folio.' + k);
    if (old === null) return;
    if (localStorage.getItem('folio.' + k + '2') === null) localStorage.setItem('folio.' + k + '2', old);
    localStorage.removeItem('folio.' + k);
  } catch {}
});

// Editors whose work exists only in memory; the browser asks before the tab closes.
const unsaved = new Set();
addEventListener('beforeunload', (e) => {
  if (!unsaved.size) return;
  e.preventDefault();
  e.returnValue = '';
});
// Store a draft (null = too big). If storing fails, warn once and fall back to the leave-page prompt.
function keepDraft(mod, k, v) {
  if (v !== null && store.set(k, v)) return unsaved.delete(mod);
  if (!unsaved.has(mod))
    UI.toast('This file is too large to keep as a browser draft. Save it before you close the tab.', true);
  unsaved.add(mod);
}

// Images are kept here once and referenced by id, so undo snapshots do not copy them.
// shortcut: entries are never freed until the page reloads; add per-document cleanup if people keep
// many image-heavy files open in one long session.
const Img = {
  map: new Map(),
  put(d) {
    if (typeof d !== 'string' || !d.startsWith('data:')) return d;
    const id = 'img:' + uid();
    this.map.set(id, d);
    return id;
  },
  get(ref) {
    return this.map.get(ref) ?? ref;
  },
};
function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
const colorCtx = document.createElement('canvas').getContext('2d');
function toHex(c) {
  if (!c) return null;
  c = String(c).trim();
  if (!c || c === 'transparent' || c === 'inherit' || c === 'initial') return null;
  colorCtx.fillStyle = '#010203';
  colorCtx.fillStyle = c;
  const v = colorCtx.fillStyle;
  if (v === '#010203' && c.toLowerCase() !== '#010203') return null;
  if (v.startsWith('#')) return v.slice(1).toUpperCase();
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((s) => parseFloat(s));
  if (p.length > 3 && p[3] === 0) return null;
  return p
    .slice(0, 3)
    .map((x) => Math.round(x).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/* ---------- UI helpers: toast, busy, modal (the viewer blocks alert/confirm/prompt) ---------- */
// While Convert runs, saves land in capture.files instead of downloading, error toasts land in
// capture.errors, and confirm dialogs answer yes (the user agreed to replace open work up front).
let capture = null;
const UI = {
  toast(msg, err) {
    if (capture) return err && capture.errors.push(msg);
    const t = el('div', { class: 'toast' + (err ? ' err' : '') }, msg);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), err ? 5000 : 3000);
  },
  busy(msg = 'Working…') {
    const b = el('div', { class: 'busy' }, el('div', {}, el('span', { class: 'spin' }), el('span', {}, msg)));
    document.body.append(b);
    return () => b.remove();
  },
  modal({ title, text, fields = [], ok = 'OK', cancel = 'Cancel', wide, body, extra }) {
    return new Promise((resolve) => {
      const bg = el('div', { class: 'modal-bg' });
      const form = el('form', { class: 'modal' + (wide ? ' wide' : '') });
      form.append(el('h3', {}, title));
      if (text) form.append(el('p', {}, text));
      const inputs = {};
      for (const f of fields) {
        const id = 'm_' + f.id;
        let inp;
        if (f.type === 'select') {
          inp = el(
            'select',
            { id, class: 'ctl' },
            ...f.options.map((o) => {
              const [v, l] = Array.isArray(o) ? o : [o, o];
              return el('option', { value: v, selected: String(v) === String(f.value) }, l);
            }),
          );
        } else if (f.type === 'textarea') {
          inp = el('textarea', { id, rows: f.rows || 4 });
          inp.value = f.value ?? '';
        } else if (f.type === 'checkbox') {
          inp = el('input', { id, type: 'checkbox', checked: !!f.value });
          form.append(el('label', { class: 'check' }, inp, f.label));
          inputs[f.id] = inp;
          continue;
        } else {
          inp = el('input', {
            id,
            type: f.type || 'text',
            min: f.min,
            max: f.max,
            step: f.step,
            placeholder: f.placeholder,
          });
          inp.value = f.value ?? '';
          if (f.type === 'color') inp.className = 'ctl';
        }
        inputs[f.id] = inp;
        form.append(el('div', { class: 'field' }, el('label', { class: 'lbl', for: id }, f.label), inp));
      }
      if (body) form.append(body);
      const done = (v) => {
        bg.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          done(null);
        }
      };
      document.addEventListener('keydown', onKey, true);
      const acts = el('div', { class: 'acts' });
      if (extra)
        acts.append(
          ...extra.map((x) =>
            el(
              'button',
              { type: 'button', class: 'btn', onclick: () => done({ _extra: x.value, ...collect() }) },
              x.label,
            ),
          ),
          el('span', { style: { flex: 1 } }),
        );
      if (cancel)
        acts.append(el('button', { type: 'button', class: 'btn', onclick: () => done(null) }, cancel));
      acts.append(el('button', { type: 'submit', class: 'btn primary' }, ok));
      form.append(acts);
      const collect = () => {
        const o = {};
        for (const [k, i] of Object.entries(inputs))
          o[k] =
            i.type === 'checkbox'
              ? i.checked
              : i.type === 'number' || i.type === 'range'
                ? parseFloat(i.value)
                : i.value;
        return o;
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        done(collect());
      });
      bg.addEventListener('mousedown', (e) => {
        if (e.target === bg) done(null);
      });
      bg.append(form);
      document.body.append(bg);
      setTimeout(
        () =>
          (
            form.querySelector('input:not([type=checkbox]),select,textarea') || form.querySelector('.primary')
          ).focus(),
        30,
      );
    });
  },
  async confirm(title, text, ok = 'Continue') {
    if (capture) return true;
    return !!(await UI.modal({ title, text, ok }));
  },
};

function emptyState(ic, title, text, actions) {
  return el(
    'div',
    { class: 'empty' },
    el(
      'div',
      { class: 'empty-in' },
      el('span', { class: 'ico', html: icon(ic) }),
      el('b', {}, title),
      el('p', {}, text),
      el(
        'div',
        { class: 'row' },
        ...actions.map(([label, fn, primary]) =>
          el('button', { class: 'btn' + (primary ? ' primary' : ''), onclick: fn }, label),
        ),
      ),
    ),
  );
}
/* ---------- saving files: the viewer's downloads capability, or a plain download when opened as a local file ---------- */
const dlCap =
  window.claude && window.claude.use
    ? window.claude.use('downloads').catch(() => null)
    : Promise.resolve(null);
async function saveFile(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  if (capture) return capture.files.push(new File([blob], name, { type: blob.type })) > 0;
  const dl = await dlCap;
  if (dl) {
    try {
      await dl.save({ filename: name, data: blob });
      UI.toast('Saved ' + name);
      return true;
    } catch (e) {
      if (e && e.code === 'declined') UI.toast('Save cancelled');
      else if (
        e &&
        (e.code === 'rejected_extension' || e.code === 'extension_not_enabled') &&
        !/\.zip$/i.test(name)
      ) {
        const z = new JSZip();
        z.file(name, blob);
        UI.toast(
          'This viewer only saves common formats, so your .' + ext(name) + ' file is packed in a .zip.',
        );
        return saveFile(name + '.zip', await z.generateAsync({ type: 'blob' }));
      } else if (e && (e.code === 'rejected_extension' || e.code === 'extension_not_enabled'))
        UI.toast('This viewer cannot save .' + ext(name) + ' files. Try another format.', true);
      else UI.toast('Could not save: ' + ((e && e.message) || e), true);
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  UI.toast('Saved ' + name);
  return true;
}
// Tell the user which characters a PDF could not hold (see Formats.pdfFonts).
const warnReplaced = (set) =>
  set.size &&
  UI.toast(`These characters are not in the PDF fonts and were saved as "?": ${[...set].join(' ')}`, true);
// Call after a save that holds the whole document, so the leave-page warning stops.
const savedWhole = (mod, ok) => ok && unsaved.delete(mod);
async function replaceOk(hasContent) {
  return (
    !hasContent ||
    (await UI.confirm(
      'Replace the open file?',
      'Loading the example replaces what is open now. Save your work first if you want to keep it.',
      'Load example',
    ))
  );
}
async function pickFiles(accept, multiple = false) {
  // Wherever a picture is picked, images saved in Your files are offered first.
  if (/image/.test(accept) && Mods.addons?.hasImages()) {
    const r = await Mods.addons.chooseImage();
    if (r) return r;
  }
  return new Promise((res) => {
    const inp = $('#filePick');
    inp.value = '';
    inp.accept = accept || '';
    inp.multiple = multiple;
    inp.onchange = () => res([...inp.files]);
    inp.click();
  });
}

/* ---------- routing ---------- */
const Mods = {};
// Font families the user added (see addons.js); editors list them after their own fonts.
const userFonts = [];
let curMod = 'home';
function show(m) {
  curMod = m;
  $$('.mod').forEach((s) => (s.hidden = s.id !== 'mod-' + m));
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.mod === m));
  $(`.tab[data-mod="${m}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  Mods[m]?.onShow?.();
}
const ROUTES = {
  pdf: 'pdf',
  docx: 'doc',
  docm: 'doc',
  dotx: 'doc',
  doc: 'doc',
  dot: 'doc',
  odt: 'doc',
  ott: 'doc',
  rtf: 'doc',
  epub: 'doc',
  htm: 'doc',
  html: 'doc',
  xhtml: 'doc',
  mht: 'doc',
  pptx: 'slides',
  pptm: 'slides',
  ppsx: 'slides',
  potx: 'slides',
  ppt: 'slides',
  pps: 'slides',
  pot: 'slides',
  odp: 'slides',
  otp: 'slides',
  xlsx: 'sheet',
  xls: 'sheet',
  xlsm: 'sheet',
  xlsb: 'sheet',
  xltx: 'sheet',
  csv: 'sheet',
  tsv: 'sheet',
  ods: 'sheet',
  ots: 'sheet',
  fods: 'sheet',
  numbers: 'sheet',
  dbf: 'sheet',
  dif: 'sheet',
  slk: 'sheet',
  sylk: 'sheet',
  prn: 'sheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  jfif: 'image',
  webp: 'image',
  gif: 'image',
  bmp: 'image',
  avif: 'image',
  ico: 'image',
  heic: 'image',
  heif: 'image',
  tif: 'image',
  tiff: 'image',
  svg: 'image',
};
const TEXT_EXT =
  'txt text md markdown json jsonc js mjs cjs ts tsx jsx css scss sass less xml svg yml yaml toml ini cfg conf log py rb go rs java c h cpp hpp cs php sh bash zsh fish ps1 bat cmd sql env gitignore dockerfile swift kt kts lua r pl dart vue svelte astro tex bib rst adoc org srt vtt sub eml ics vcf properties gradle makefile cmake nfo diff patch graphql proto ipynb'.split(
    ' ',
  );
// Which editor opens a file, or null.
function routeOf(file) {
  const e = ext(file.name);
  return ROUTES[e] || (TEXT_EXT.includes(e) || (file.type || '').startsWith('text/') ? 'text' : null);
}
async function openFile(file) {
  const e = ext(file.name);
  if (e === 'pages' || e === 'key') {
    const d = UI.busy('Reading ' + file.name + '…');
    try {
      const prev = await Formats.iworkPreview(file);
      UI.toast(
        'Opened the preview stored inside ' +
          file.name +
          '. For full editing, export it from ' +
          (e === 'key' ? 'Keynote as .pptx.' : 'Pages as .docx.'),
      );
      return openFile(prev);
    } catch (err) {
      return UI.toast('Could not open ' + file.name + ': ' + err.message, true);
    } finally {
      d();
    }
  }
  if (
    [
      'wpd',
      'wps',
      'xps',
      'oxps',
      'psd',
      'ai',
      'indd',
      'cdr',
      'dwg',
      'raw',
      'cr2',
      'nef',
      'arw',
      'dng',
    ].includes(e)
  )
    return UI.toast(
      `.${e} files are not supported. Export the file as PDF, DOCX, PNG or JPG and open that.`,
      true,
    );
  const mod = routeOf(file);
  if (!mod)
    return UI.toast(
      `No editor for .${e || 'unknown'} files. Supported: PDF, DOCX, PPTX, XLSX/CSV, images and text.`,
      true,
    );
  const done = UI.busy('Opening ' + file.name + '…');
  try {
    try {
      await Mods[mod].load(file);
      unsaved.delete(mod);
    } catch (err) {
      if (e === 'numbers') {
        const prev = await Formats.iworkPreview(file);
        UI.toast(
          'Opened the preview stored inside ' +
            file.name +
            '. Export it from Numbers as .xlsx for full editing.',
        );
        done();
        return openFile(prev);
      }
      throw err;
    }
    show(mod);
  } catch (err) {
    console.error(err);
    UI.toast('Could not open ' + file.name + ': ' + (err.message || err), true);
  } finally {
    done();
  }
}

/* ---------- global wiring ---------- */
$$('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.mod)));
$('#openAny').onclick = async () => {
  const [f] = await pickFiles('');
  if (f) openFile(f);
};
$('#homeDrop').onclick = $('#openAny').onclick;
$('#homeDrop').onkeydown = (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('#openAny').onclick();
  }
};
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (e.dataTransfer?.types?.includes('Files')) {
    dragDepth++;
    $('#homeDrop').classList.add('over');
  }
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    $('#homeDrop').classList.remove('over');
  }
});
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  dragDepth = 0;
  $('#homeDrop').classList.remove('over');
  const files = [...e.dataTransfer.files];
  if (curMod === 'compare' || curMod === 'convert' || curMod === 'addons') return Mods[curMod].drop(files);
  if (
    curMod === 'pdf' &&
    Mods.pdf.hasDoc() &&
    files.every((f) => ext(f.name) === 'pdf' || ROUTES[ext(f.name)] === 'image')
  ) {
    Mods.pdf.append(files);
    return;
  }
  openFile(files[0]);
});
document.addEventListener('click', (e) => {
  $$('details.menu[open]').forEach((d) => {
    if (!d.contains(e.target) || e.target.closest('.menu-list button')) d.open = false;
  });
});
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    Mods[curMod]?.save?.();
  } else if (mod && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    Mods[curMod]?.open ? Mods[curMod].open() : $('#openAny').onclick();
  }
});
// theme: system → light → dark
const THEMES = ['system', 'light', 'dark'];
let theme = store.get('theme') || 'system';
function applyTheme() {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  $('#themeBtn').title = 'Theme: ' + theme;
  $('#themeBtn').innerHTML = icon(theme === 'system' ? 'monitor' : theme === 'light' ? 'sun' : 'moon');
}
$('#themeBtn').onclick = () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % 3];
  store.set('theme', theme);
  applyTheme();
};
applyTheme();
// keep focus inside editors when clicking toolbar buttons
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('.toolbar .btn, .toolbar summary') && !e.target.closest('label')) e.preventDefault();
});
// The single-file build embeds files as <script type="text/plain" data-file="path">: base64 when marked
// data-base64, and gzipped too when marked data-gzip. Elsewhere they are plain files next to index.html.
const embedded = (path) => document.querySelector(`script[data-file="${path}"]`);
async function asset(path) {
  const e = embedded(path);
  if (e && !e.hasAttribute('data-base64')) return new TextEncoder().encode(e.textContent).buffer;
  if (e) {
    const bytes = dataURLtoBytes(',' + e.textContent.trim());
    if (!e.hasAttribute('data-gzip')) return bytes.buffer;
    return new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer();
  }
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.arrayBuffer();
}
if (window.pdfjsLib) {
  const w = embedded('vendor/pdf.worker.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = w
    ? URL.createObjectURL(new Blob([w.textContent], { type: 'text/javascript' }))
    : 'vendor/pdf.worker.min.js';
}

paintIcons();
/* ============================== HOME ============================== */
const HOME_CARDS = [
  ['doc', 'fDoc', '--c-doc', 'Document', 'Write and format; save as Word, PDF or ODT'],
  ['sheet', 'fSheet', '--c-xls', 'Spreadsheet', 'Formulas, charts; save as Excel or CSV'],
  ['slides', 'fSlides', '--c-ppt', 'Presentation', 'Slides and themes; save as PowerPoint'],
  ['pdf', 'fPdf', '--c-pdf', 'PDF', 'Edit text, sign, merge and reorder pages'],
  ['image', 'fImg', '--c-img', 'Photo', 'Remove backgrounds, enhance, add text'],
  ['text', 'fText', '--c-txt', 'Text or code', 'Markdown preview, JSON tools'],
];
const HOME_TOOLS = [
  [
    'compare',
    'fCompare',
    '--c-doc',
    'Compare two versions',
    'See every word added, removed or moved between two files',
  ],
  [
    'convert',
    'fConvert',
    '--c-pdf',
    'Convert many files',
    'Turn a batch of files into PDF, Word, images and more',
  ],
  ['addons', 'fAddon', '--c-img', 'Your files', 'Your own fonts, images, templates and OCR languages'],
];
const homeRows = (list) =>
  list.map(([m, ic, col, name, desc]) =>
    el(
      'button',
      { class: 'new-row', style: `--k:var(${col})`, onclick: () => show(m) },
      el('span', { class: 'ico', html: icon(ic) }),
      el('b', {}, name),
      el('span', {}, desc),
    ),
  );
$('#homeCards').append(...homeRows(HOME_CARDS));
$('#homeTools').append(...homeRows(HOME_TOOLS));
