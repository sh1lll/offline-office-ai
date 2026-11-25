'use strict';
/* ============================== PDF ============================== */
Mods.pdf = (() => {
  const desk = $('#pdfDesk'),
    thumbs = $('#pdfThumbs'),
    bar = $('#pdfBar');
  let sources = [],
    pages = [],
    name = 'document',
    scale = 1.25,
    tool = 'select',
    cur = 0;
  let selPages = new Set(),
    selAnn = null,
    pending = null,
    editing = null;
  let meta = {},
    settings = { watermark: null, numbers: null, header: null },
    formValues = new Map();
  let undoStack = [],
    redoStack = [],
    booted = false;
  const views = new Map();
  const FONTCSS = {
    Helvetica: 'Helvetica, Arial, sans-serif',
    TimesRoman: '"Times New Roman", Times, serif',
    Courier: '"Courier New", Courier, monospace',
  };
  const rot = (p) => (((p.baseRot + p.rot) % 360) + 360) % 360;
  const disp = (p) => (rot(p) % 180 ? [p.h, p.w] : [p.w, p.h]);
  const style = () => ({
    color: $('#pdfColor').value,
    size: +$('#pdfSize').value,
    font: $('#pdfFont').value,
    bold: $('#pdfBold').getAttribute('aria-pressed') === 'true',
  });
  const curPage = () => pages[cur];
  const targets = () =>
    selPages.size ? pages.filter((p) => selPages.has(p.id)) : curPage() ? [curPage()] : [];

  /* --- history --- */
  const snap = () => pages.map((p) => ({ ...p, annots: JSON.parse(JSON.stringify(p.annots)) }));
  function pushHist() {
    unsaved.add('pdf');
    undoStack.push(snap());
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snap());
    pages = undoStack.pop();
    selAnn = null;
    renderAll();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snap());
    pages = redoStack.pop();
    selAnn = null;
    renderAll();
  }

  /* --- sources --- */
  async function addSourceBytes(bytes, nm) {
    let pdf;
    try {
      // isEvalSupported: false closes CVE-2024-4367 (code execution via crafted fonts) in this pdf.js version.
      pdf = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException')
        throw new Error('this PDF is password-protected. Remove the password first.');
      throw e;
    }
    const src = { id: uid(), name: nm, bytes, pdf, lib: null };
    sources.push(src);
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale: 1, rotation: 0 });
      out.push({
        id: uid(),
        src,
        idx: i - 1,
        baseRot: pg.rotate || 0,
        rot: 0,
        w: vp.width,
        h: vp.height,
        annots: [],
      });
    }
    return out;
  }
  async function imageSource(file) {
    const { PDFDocument } = PDFLib;
    const d = await PDFDocument.create();
    let img;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.type === 'image/jpeg') img = await d.embedJpg(bytes);
    else if (file.type === 'image/png') img = await d.embedPng(bytes);
    else {
      const im = await Formats.decodeImage(file);
      const c = el('canvas', { width: im.width, height: im.height });
      c.getContext('2d').drawImage(im, 0, 0);
      img = await d.embedPng(dataURLtoBytes(c.toDataURL('image/png')));
    }
    const k = Math.min(1, 842 / Math.max(img.width, img.height));
    const w = img.width * k,
      h = img.height * k;
    d.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
    return addSourceBytes(await d.save(), file.name);
  }
  async function blankPages(w = 612, h = 792) {
    const d = await PDFLib.PDFDocument.create();
    d.addPage([w, h]);
    return addSourceBytes(await d.save(), 'blank');
  }
  async function filesToPages(files) {
    const all = [];
    for (const f of files) {
      if (ext(f.name) === 'pdf')
        all.push(...(await addSourceBytes(new Uint8Array(await f.arrayBuffer()), f.name)));
      else if ((f.type || '').startsWith('image/') || ROUTES[ext(f.name)] === 'image')
        all.push(...(await imageSource(f)));
      else UI.toast('Skipped ' + f.name + ': only PDFs and images can be merged.', true);
    }
    return all;
  }
  async function load(file) {
    const isImg = (file.type || '').startsWith('image/');
    sources = [];
    formValues = new Map();
    meta = {};
    settings = { watermark: null, numbers: null, header: null };
    undoStack = [];
    redoStack = [];
    pages = await filesToPages([file]);
    name = base(file.name);
    cur = 0;
    selPages.clear();
    selAnn = null;
    booted = true;
    if (!isImg) {
      try {
        const lib = await PDFLib.PDFDocument.load(pages[0].src.bytes, {
          ignoreEncryption: true,
          updateMetadata: false,
        });
        meta = {
          title: lib.getTitle() || '',
          author: lib.getAuthor() || '',
          subject: lib.getSubject() || '',
          keywords: lib.getKeywords() || '',
        };
        pages[0].src.lib = lib;
      } catch {}
    }
    renderAll();
    requestAnimationFrame(fitWidth);
  }
  async function append(files) {
    const done = UI.busy('Adding pages…');
    try {
      pushHist();
      const np = await filesToPages(files);
      pages.push(...np);
      renderAll();
      UI.toast(`Added ${np.length} page${np.length === 1 ? '' : 's'}`);
    } catch (e) {
      UI.toast('Could not add: ' + e.message, true);
    } finally {
      done();
    }
  }
  async function open() {
    const [f] = await pickFiles('.pdf,application/pdf');
    if (f) openFile(f);
  }

  /* --- rendering --- */
  const io = new IntersectionObserver(
    (ents) =>
      ents.forEach((en) => {
        if (en.isIntersecting) {
          const v = views.get(en.target.dataset.id);
          const p = pages.find((x) => x.id === en.target.dataset.id);
          if (v && p && !v.rendered) paint(p, v);
        }
      }),
    { root: desk, rootMargin: '800px' },
  );
  async function paint(p, v) {
    if (v.busy) {
      v.again = true;
      return;
    }
    v.busy = true;
    try {
      const pg = await p.src.pdf.getPage(p.idx + 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = pg.getViewport({ scale: scale * dpr, rotation: rot(p) });
      v.canvas.width = Math.floor(vp.width);
      v.canvas.height = Math.floor(vp.height);
      await pg.render({ canvasContext: v.canvas.getContext('2d'), viewport: vp }).promise;
      v.rendered = true;
    } catch (e) {
      console.warn(e);
    }
    v.busy = false;
    if (v.again) {
      v.again = false;
      paint(p, v);
    }
  }
  async function paintThumb(p, c) {
    try {
      const pg = await p.src.pdf.getPage(p.idx + 1);
      const [dw] = disp(p);
      const vp = pg.getViewport({ scale: 220 / dw, rotation: rot(p) });
      c.width = vp.width;
      c.height = vp.height;
      c.style.width = '110px';
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    } catch (e) {
      console.warn(e);
    }
  }
  const thumbIo = new IntersectionObserver(
    (ents) =>
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        thumbIo.unobserve(en.target);
        const p = pages.find((x) => x.id === en.target.dataset.id);
        if (p) paintThumb(p, en.target.querySelector('canvas'));
      }),
    { root: thumbs, rootMargin: '600px' },
  );
  function renderAll() {
    io.disconnect();
    thumbIo.disconnect();
    views.clear();
    desk.innerHTML = '';
    thumbs.innerHTML = '';
    desk.parentElement.classList.toggle('no-thumbs', !pages.length);
    $('#pdfZoom').style.visibility = pages.length ? '' : 'hidden';
    if (!pages.length) {
      desk.append(
        emptyState('fPdf', 'No PDF open', 'Open a PDF, or drop PDFs and images here to combine them.', [
          ['Open PDF…', open, true],
          ['New blank PDF', () => bar.querySelector('[data-a="new"]').click()],
          ['Load example', () => bar.querySelector('[data-a="example"]').click()],
        ]),
      );
      status();
      return;
    }
    cur = clamp(cur, 0, pages.length - 1);
    pages.forEach((p, i) => {
      const [dw, dh] = disp(p);
      const canvas = el('canvas'),
        ov = el('div', { class: 'overlay t-' + tool });
      const wrap = el(
        'div',
        {
          class: 'pdf-page' + (i === cur ? ' cur' : ''),
          'data-id': p.id,
          style: { width: dw * scale + 'px', height: dh * scale + 'px' },
        },
        el('span', { class: 'pnum' }, `${i + 1}`),
        canvas,
        ov,
      );
      desk.append(wrap);
      const v = { wrap, canvas, ov, rendered: false };
      views.set(p.id, v);
      io.observe(wrap);
      wireOverlay(p, ov);
      renderAnnots(p);
      // thumbnail
      const tc = el('canvas');
      const th = el(
        'div',
        {
          class: 'thumb' + (selPages.has(p.id) ? ' sel' : ''),
          draggable: 'true',
          'data-id': p.id,
          title: 'Click to select, drag to reorder',
        },
        tc,
        el('span', {}, `${i + 1}`),
      );
      th.onclick = (e) => {
        if (e.shiftKey && selPages.size) {
          const ids = pages.map((x) => x.id);
          const last = ids.indexOf([...selPages].pop());
          const [a, b] = [Math.min(last, i), Math.max(last, i)];
          ids.slice(a, b + 1).forEach((id) => selPages.add(id));
        } else if (e.metaKey || e.ctrlKey) selPages.has(p.id) ? selPages.delete(p.id) : selPages.add(p.id);
        else {
          selPages.clear();
          selPages.add(p.id);
        }
        $$('.thumb', thumbs).forEach((t) => t.classList.toggle('sel', selPages.has(t.dataset.id)));
        setCur(i);
        wrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };
      th.ondragstart = (e) => {
        e.dataTransfer.setData('text/x-page', p.id);
        e.dataTransfer.effectAllowed = 'move';
      };
      th.ondragover = (e) => {
        if (e.dataTransfer.types.includes('text/x-page')) {
          e.preventDefault();
          th.classList.add('drag-over');
        }
      };
      th.ondragleave = () => th.classList.remove('drag-over');
      th.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        th.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/x-page');
        if (!id || id === p.id) return;
        pushHist();
        const from = pages.findIndex((x) => x.id === id);
        const [m] = pages.splice(from, 1);
        pages.splice(
          pages.findIndex((x) => x.id === p.id),
          0,
          m,
        );
        renderAll();
      };
      // Size the empty canvas so unpainted thumbnails keep their place in the list.
      tc.width = 220;
      tc.height = Math.round((220 * dh) / dw);
      tc.style.width = '110px';
      thumbs.append(th);
      thumbIo.observe(th);
    });
    status();
  }
  function setCur(i) {
    cur = i;
    $$('.pdf-page', desk).forEach((w, j) => w.classList.toggle('cur', j === i));
    status();
  }
  desk.addEventListener(
    'scroll',
    debounce(() => {
      const top = desk.getBoundingClientRect().top + 80;
      let best = 0;
      $$('.pdf-page', desk).forEach((w, i) => {
        if (w.getBoundingClientRect().top <= top) best = i;
      });
      if (best !== cur) setCur(best);
    }, 80),
  );
  function status() {
    const hints = {
      edittext:
        'Click any line of existing text to retype it · clear the line to delete it · select an edit and press Delete to undo it',
      select: 'Click an item to select · drag to move · double-click text to edit · Delete removes',
      text: 'Click on the page to type',
      draw: 'Drag to draw',
      highlight: 'Drag over text to highlight',
      rect: 'Drag to draw a box',
      ellipse: 'Drag to draw an oval',
      whiteout: 'Drag to cover content with white, then add new text on top',
      place: 'Click where the image should go',
    };
    $('#pdfStatus').innerHTML = pages.length
      ? `<span><b>${esc(name)}.pdf</b></span><span>Page ${cur + 1} of ${pages.length}</span>${selPages.size ? `<span>${selPages.size} selected</span>` : ''}<span>${hints[tool] || ''}</span>`
      : '';
    $('#pdfZoom').textContent = Math.round((scale / 1.333) * 100) + '%';
  }

  /* --- annotations --- */
  function annEl(p, a) {
    let e;
    if (a.type === 'text') {
      e = el('div', { class: 'an text', 'data-id': a.id });
      e.textContent = a.text;
      Object.assign(e.style, {
        left: a.x * 100 + '%',
        top: a.y * 100 + '%',
        fontSize: a.size * scale + 'px',
        color: a.color,
        fontFamily: FONTCSS[a.font] || `"${a.font.slice(5)}"`,
        fontWeight: a.bold ? '700' : '400',
      });
    } else if (a.type === 'ink') {
      e = el('div', { class: 'an ink', 'data-id': a.id });
      const pts = a.points.map(([u, v]) => `${u.toFixed(5)},${v.toFixed(5)}`).join(' ');
      const w = a.width * scale;
      e.innerHTML = `<svg viewBox="0 0 1 1" preserveAspectRatio="none" style="${selAnn === a ? 'filter:drop-shadow(0 0 2px #0d6b66) drop-shadow(0 0 2px #0d6b66)' : ''}"><polyline points="${pts}" fill="none" stroke="transparent" stroke-width="${w + 12}" vector-effect="non-scaling-stroke" style="pointer-events:stroke;cursor:move"/><polyline points="${pts}" fill="none" stroke="${a.color}" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else {
      e = el('div', {
        class: 'an box ' + a.type,
        'data-id': a.id,
        style: {
          left: a.x * 100 + '%',
          top: a.y * 100 + '%',
          width: a.w * 100 + '%',
          height: a.h * 100 + '%',
        },
      });
      if (a.type === 'highlight')
        Object.assign(e.style, { background: a.color, opacity: 0.38, mixBlendMode: 'multiply' });
      if (a.type === 'rect' || a.type === 'ellipse')
        Object.assign(e.style, {
          border: `${Math.max(1, a.width * scale)}px solid ${a.color}`,
          borderRadius: a.type === 'ellipse' ? '50%' : '0',
        });
      if (a.type === 'whiteout')
        Object.assign(e.style, { background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.08)' });
      if (a.type === 'image') e.append(el('img', { src: Img.get(a.src), alt: '' }));
      e.append(el('div', { class: 'h' }));
    }
    if (selAnn === a) e.classList.add('sel');
    return e;
  }
  function renderAnnots(p) {
    const v = views.get(p.id);
    if (!v) return;
    v.ov.innerHTML = '';
    p.annots.forEach((a) => {
      if (a.cover)
        v.ov.append(
          el('div', {
            class: 'an-cover',
            style: {
              left: a.cover.x * 100 + '%',
              top: a.cover.y * 100 + '%',
              width: a.cover.w * 100 + '%',
              height: a.cover.h * 100 + '%',
              background: a.cover.bg,
            },
          }),
        );
    });
    p.annots.forEach((a) => v.ov.append(annEl(p, a)));
    if (tool !== 'edittext') return;
    const token = (v.hitToken = {});
    textLines(p)
      .then((lines) => {
        if (v.hitToken !== token || tool !== 'edittext') return;
        lines.forEach((l, i) => {
          if (p.annots.some((a) => a.srcLine === l.key)) return;
          const h = el('div', {
            class: 'hit',
            title: 'Click to edit: ' + l.str,
            style: {
              left: l.x * 100 + '%',
              top: l.y * 100 + '%',
              width: l.w * 100 + '%',
              height: l.h * 100 + '%',
            },
          });
          h.dataset.i = i;
          v.ov.append(h);
        });
      })
      .catch((e) => console.warn(e));
  }
  const textCache = new Map();
  async function textLines(p) {
    const key = p.src.id + ':' + p.idx + ':' + rot(p);
    if (textCache.has(key)) return textCache.get(key);
    const pg = await p.src.pdf.getPage(p.idx + 1);
    const vp = pg.getViewport({ scale: 1, rotation: rot(p) });
    const tc = await pg.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const m = pdfjsLib.Util.transform(vp.transform, it.transform);
      if (Math.abs(m[1]) > 1e-3 || Math.abs(m[2]) > 1e-3 || m[0] <= 0) continue;
      const size = Math.abs(m[3]) || m[0];
      if (size < 2) continue;
      let fname = '';
      try {
        fname = pg.commonObjs.get(it.fontName)?.name || '';
      } catch {}
      items.push({
        x: m[4],
        by: m[5],
        w: Math.abs(it.width),
        size,
        str: it.str,
        fam: (tc.styles[it.fontName]?.fontFamily || '') + ' ' + fname,
      });
    }
    items.sort((a, b) => a.by - b.by || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const L = lines.find(
        (l) =>
          Math.abs(l.by - it.by) < l.size * 0.35 &&
          it.x >= l.x2 - l.size * 0.6 &&
          it.x - l.x2 < l.size * 0.9 &&
          Math.abs(l.size - it.size) < l.size * 0.3,
      );
      if (L) {
        const gap = it.x - L.x2;
        L.str += (gap > it.size * 0.15 && !/\s$/.test(L.str) && !/^\s/.test(it.str) ? ' ' : '') + it.str;
        L.x2 = Math.max(L.x2, it.x + it.w);
      } else lines.push({ x: it.x, x2: it.x + it.w, by: it.by, size: it.size, str: it.str, fam: it.fam });
    }
    const out = lines
      .filter((l) => l.str.trim())
      .map((l, i) => ({
        key: key + '#' + i,
        x: l.x / vp.width,
        y: (l.by - l.size * 0.9) / vp.height,
        w: (l.x2 - l.x) / vp.width,
        h: (l.size * 1.15) / vp.height,
        by: l.by / vp.height,
        size: Math.round(l.size * 10) / 10,
        str: l.str.trim(),
        font: /courier|mono/i.test(l.fam)
          ? 'Courier'
          : /times|georgia|garamond|roman|minion|cambria|palatino|book|serif/i.test(l.fam) &&
              !/sans/i.test(l.fam)
            ? 'TimesRoman'
            : 'Helvetica',
        bold: /bold|black|heavy|semibold|demi/i.test(l.fam),
      }));
    textCache.set(key, out);
    return out;
  }
  function sampleColors(p, l) {
    const c = views.get(p.id)?.canvas;
    if (!c || !c.width) return { bg: '#ffffff', fg: '#000000' };
    const X = Math.max(0, Math.floor(l.x * c.width) - 3),
      Y = Math.max(0, Math.floor(l.y * c.height) - 3),
      W = Math.min(c.width - X, Math.ceil(l.w * c.width) + 6),
      H = Math.min(c.height - Y, Math.ceil(l.h * c.height) + 6);
    if (W < 2 || H < 2) return { bg: '#ffffff', fg: '#000000' };
    const d = c.getContext('2d').getImageData(X, Y, W, H).data;
    const px = (x, y) => {
      const i = (y * W + x) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    };
    const edge = [];
    for (let x = 0; x < W; x++) edge.push(px(x, 0), px(x, H - 1));
    for (let y = 0; y < H; y++) edge.push(px(0, y), px(W - 1, y));
    const med = (k) => {
      const a = edge.map((e) => e[k]).sort((m, n) => m - n);
      return a[a.length >> 1];
    };
    const bg = [med(0), med(1), med(2)];
    let best = 0,
      fg = [0, 0, 0];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const q = px(x, y);
        const dd = Math.abs(q[0] - bg[0]) + Math.abs(q[1] - bg[1]) + Math.abs(q[2] - bg[2]);
        if (dd > best) {
          best = dd;
          fg = q;
        }
      }
    const hx = (a) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('');
    return { bg: hx(bg), fg: best > 60 ? hx(fg) : '#000000' };
  }
  async function editLine(p, i) {
    const l = (await textLines(p))[i];
    if (!l) return;
    const [, dh] = disp(p);
    const { bg, fg } = sampleColors(p, l);
    pushHist();
    const a = {
      id: uid(),
      type: 'text',
      x: l.x,
      y: l.by - (0.93 * l.size) / dh,
      text: l.str,
      size: l.size,
      color: fg,
      font: l.font,
      bold: l.bold,
      cover: { x: l.x - 0.003, y: l.y, w: l.w + 0.006, h: l.h, bg },
      srcLine: l.key,
    };
    p.annots.push(a);
    selAnn = a;
    renderAnnots(p);
    const n = views.get(p.id).ov.querySelector(`.an[data-id="${a.id}"]`);
    setTimeout(() => startEdit(p, a, n, true), 0);
  }
  function select(a, p) {
    selAnn = a;
    pages.forEach(renderAnnots);
    if (a && a.type !== 'ink' && a.type !== 'image' && a.type !== 'whiteout') {
      $('#pdfColor').value = a.color;
    }
  }
  function removeAnn(a) {
    const p = pages.find((x) => x.annots.includes(a));
    if (!p) return;
    pushHist();
    p.annots = p.annots.filter((x) => x !== a);
    if (selAnn === a) selAnn = null;
    renderAnnots(p);
  }
  function startEdit(p, a, e, selectAll) {
    editing = a;
    try {
      e.contentEditable = 'plaintext-only';
    } catch {
      e.contentEditable = 'true';
    }
    if (e.contentEditable !== 'plaintext-only') e.contentEditable = 'true';
    e.focus();
    if (selectAll) {
      const r = document.createRange();
      r.selectNodeContents(e);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    e.onkeydown = (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') e.blur();
    };
    e.onblur = () => {
      editing = null;
      e.contentEditable = 'false';
      const t = e.innerText.replace(/\n$/, '');
      if (!t.trim() && !a.cover) p.annots = p.annots.filter((x) => x !== a);
      else a.text = t.trim() ? t : '';
      renderAnnots(p);
    };
  }
  function wireOverlay(p, ov) {
    ov.addEventListener('dblclick', (e) => {
      const ae = e.target.closest('.an.text');
      if (!ae) return;
      const a = p.annots.find((x) => x.id === ae.dataset.id);
      if (a) startEdit(p, a, ae, false);
    });
    ov.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.isContentEditable) return;
      if (e.target.classList.contains('hit')) {
        e.preventDefault();
        const i = pages.indexOf(p);
        if (i !== cur) setCur(i);
        editLine(p, +e.target.dataset.i);
        return;
      }
      const i = pages.indexOf(p);
      if (i !== cur) setCur(i);
      const R = ov.getBoundingClientRect();
      const pt = (ev) => [
        clamp((ev.clientX - R.left) / R.width, 0, 1),
        clamp((ev.clientY - R.top) / R.height, 0, 1),
      ];
      const [u0, v0] = pt(e);
      const st = style();
      const [dw, dh] = disp(p);
      const ae = e.target.closest('.an');
      const a = ae && p.annots.find((x) => x.id === ae.dataset.id);
      const drag = (move, up) => {
        ov.setPointerCapture(e.pointerId);
        const mv = (ev) => move(pt(ev), ev);
        const u = (ev) => {
          ov.removeEventListener('pointermove', mv);
          ov.removeEventListener('pointerup', u);
          ov.removeEventListener('pointercancel', u);
          up && up(pt(ev));
        };
        ov.addEventListener('pointermove', mv);
        ov.addEventListener('pointerup', u);
        ov.addEventListener('pointercancel', u);
      };
      if (tool === 'select' || tool === 'edittext' || (tool === 'text' && a)) {
        if (!a) {
          if (selAnn) select(null);
          return;
        }
        e.preventDefault();
        select(a, p);
        pushHist();
        let moved = false;
        const el0 = views.get(p.id).ov.querySelector(`[data-id="${a.id}"]`);
        if (e.target.classList.contains('h')) {
          const w0 = a.w,
            h0 = a.h,
            ratio = a.w / a.h;
          drag(
            ([u, v], ev) => {
              moved = true;
              a.w = Math.max(0.01, w0 + u - u0);
              a.h = a.type === 'image' && !ev.shiftKey ? a.w / ratio : Math.max(0.005, h0 + v - v0);
              el0.style.width = a.w * 100 + '%';
              el0.style.height = a.h * 100 + '%';
            },
            () => {
              if (!moved) undoStack.pop();
            },
          );
          return;
        }
        const ox = a.x,
          oy = a.y,
          opts = a.points && a.points.map((q) => q.slice());
        drag(
          ([u, v]) => {
            moved = true;
            const du = u - u0,
              dv = v - v0;
            if (a.type === 'ink') {
              a.points = opts.map(([x, y]) => [x + du, y + dv]);
              renderAnnots(p);
            } else {
              a.x = ox + du;
              a.y = oy + dv;
              const n = views.get(p.id).ov.querySelector(`[data-id="${a.id}"]`);
              n.style.left = a.x * 100 + '%';
              n.style.top = a.y * 100 + '%';
            }
          },
          () => {
            if (!moved) {
              undoStack.pop();
              if ((tool === 'text' || tool === 'edittext') && a.type === 'text')
                startEdit(p, a, views.get(p.id).ov.querySelector(`[data-id="${a.id}"]`), false);
            }
          },
        );
        return;
      }
      e.preventDefault();
      if (tool === 'text') {
        pushHist();
        const t = {
          id: uid(),
          type: 'text',
          x: u0,
          y: clamp(v0 - (st.size * 0.6) / dh, 0, 1),
          text: '',
          size: st.size,
          color: st.color,
          font: st.font,
          bold: st.bold,
        };
        p.annots.push(t);
        selAnn = t;
        renderAnnots(p);
        const n = views.get(p.id).ov.querySelector(`[data-id="${t.id}"]`);
        n.textContent = '';
        setTimeout(() => startEdit(p, t, n, true), 0);
        return;
      }
      if (tool === 'place' && pending) {
        pushHist();
        const w = Math.min(pending.w || 0.35, 0.9);
        const h = (w * dw) / pending.aspect / dh;
        const img = {
          id: uid(),
          type: 'image',
          x: clamp(u0 - w / 2, 0, 1 - w),
          y: clamp(v0 - h / 2, 0, 1),
          w,
          h,
          src: Img.put(pending.src),
        };
        p.annots.push(img);
        pending = null;
        setTool('select');
        select(img, p);
        return;
      }
      if (tool === 'draw') {
        pushHist();
        const ink = {
          id: uid(),
          type: 'ink',
          points: [[u0, v0]],
          color: st.color,
          width: Math.max(1, st.size / 6),
        };
        p.annots.push(ink);
        renderAnnots(p);
        drag(
          ([u, v]) => {
            ink.points.push([u, v]);
            const svgs = views
              .get(p.id)
              .ov.querySelector(`[data-id="${ink.id}"]`)
              .querySelectorAll('polyline');
            const pts = ink.points.map((q) => q.join(',')).join(' ');
            svgs.forEach((s) => s.setAttribute('points', pts));
          },
          () => {
            if (ink.points.length < 2) {
              p.annots.pop();
              undoStack.pop();
              renderAnnots(p);
            }
          },
        );
        return;
      }
      if (['highlight', 'rect', 'ellipse', 'whiteout'].includes(tool)) {
        pushHist();
        const b = {
          id: uid(),
          type: tool,
          x: u0,
          y: v0,
          w: 0,
          h: 0,
          color: tool === 'highlight' && st.color === '#c0392b' ? '#ffd43b' : st.color,
          width: Math.max(1, st.size / 7),
        };
        p.annots.push(b);
        renderAnnots(p);
        const n = () => views.get(p.id).ov.querySelector(`[data-id="${b.id}"]`);
        drag(
          ([u, v]) => {
            b.x = Math.min(u, u0);
            b.y = Math.min(v, v0);
            b.w = Math.abs(u - u0);
            b.h = Math.abs(v - v0);
            const m = n();
            Object.assign(m.style, {
              left: b.x * 100 + '%',
              top: b.y * 100 + '%',
              width: b.w * 100 + '%',
              height: b.h * 100 + '%',
            });
          },
          () => {
            if (b.w < 0.004 || b.h < 0.003) {
              p.annots.pop();
              undoStack.pop();
              renderAnnots(p);
            }
          },
        );
      }
    });
  }
  function setTool(t) {
    tool = t;
    $$('#pdfTools button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    $$('.overlay', desk).forEach((o) => (o.className = 'overlay t-' + t));
    if (t !== 'select' && t !== 'edittext' && selAnn) select(null);
    pages.forEach(renderAnnots);
    status();
    if (t === 'edittext' && !store.get('editTextTip')) {
      store.set('editTextTip', 1);
      UI.modal({
        title: 'Editing existing text',
        text: 'Click a line to retype it. Your text is drawn over the original in a matching font, size and color. The original text stays in the file underneath (White-out works the same way), so neither one hides sensitive information from someone who copies text out of the PDF.',
        ok: 'Got it',
        cancel: null,
      });
    }
  }
  $('#pdfTools').onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (b) setTool(b.dataset.t);
  };
  // style changes apply to the selected annotation
  const restyle = () => {
    if (!selAnn) return;
    const st = style();
    pushHist();
    if ('color' in selAnn && selAnn.type !== 'whiteout') selAnn.color = st.color;
    if (selAnn.type === 'text') Object.assign(selAnn, { size: st.size, font: st.font, bold: st.bold });
    if (selAnn.type === 'ink') selAnn.width = Math.max(1, st.size / 6);
    if (selAnn.type === 'rect' || selAnn.type === 'ellipse') selAnn.width = Math.max(1, st.size / 7);
    pages.forEach(renderAnnots);
  };
  $('#pdfColor').addEventListener('change', restyle);
  $('#pdfSize').onchange = restyle;
  $('#pdfFont').onchange = restyle;
  $('#pdfBold').onclick = () => {
    const b = $('#pdfBold');
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
    restyle();
  };

  document.addEventListener('keydown', (e) => {
    if (
      curMod !== 'pdf' ||
      editing ||
      e.target.closest('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]')
    )
      return;
    const m = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selAnn) {
      e.preventDefault();
      removeAnn(selAnn);
    } else if (m && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (m && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key === 'Escape') {
      select(null);
      pending = null;
      setTool('select');
    } else if (!m && !e.altKey) {
      const k = {
        v: 'select',
        e: 'edittext',
        t: 'text',
        p: 'draw',
        h: 'highlight',
        r: 'rect',
        w: 'whiteout',
      }[e.key.toLowerCase()];
      if (k) setTool(k);
    }
  });

  /* --- signature + image placing --- */
  async function placeImage(src) {
    const im = await loadImg(src);
    pending = { src, aspect: im.width / im.height, w: 0.3 };
    setTool('place');
    UI.toast('Click on a page to place it');
  }
  async function signature() {
    const pad = el('canvas', { class: 'sigpad', width: 840, height: 360 });
    const ctx = pad.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    let drawing = false,
      drawn = false,
      last;
    const P = (e) => {
      const r = pad.getBoundingClientRect();
      return [((e.clientX - r.left) * pad.width) / r.width, ((e.clientY - r.top) * pad.height) / r.height];
    };
    pad.onpointerdown = (e) => {
      drawing = true;
      drawn = true;
      pad.setPointerCapture(e.pointerId);
      last = P(e);
      ctx.strokeStyle = colorInp.value;
    };
    pad.onpointermove = (e) => {
      if (!drawing) return;
      const q = P(e);
      ctx.beginPath();
      ctx.moveTo(...last);
      ctx.lineTo(...q);
      ctx.stroke();
      last = q;
    };
    pad.onpointerup = () => (drawing = false);
    const colorInp = el('input', { type: 'color', value: '#1a2b6d', class: 'ctl' });
    const typed = el('input', {
      type: 'text',
      placeholder: 'Or type your name',
      class: 'ctl',
      style: { flex: 1 },
    });
    const fontSel = el(
      'select',
      { class: 'ctl' },
      el('option', { value: 'Caveat' }, 'Handwritten'),
      el('option', { value: 'Dancing Script' }, 'Script'),
      el('option', { value: 'Georgia' }, 'Serif'),
    );
    const render = () => {
      ctx.clearRect(0, 0, pad.width, pad.height);
      drawn = false;
      if (!typed.value.trim()) return;
      ctx.fillStyle = colorInp.value;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      let fs = 150;
      ctx.font = `600 ${fs}px "${fontSel.value}"`;
      while (ctx.measureText(typed.value).width > pad.width - 40 && fs > 30) {
        fs -= 6;
        ctx.font = `600 ${fs}px "${fontSel.value}"`;
      }
      ctx.fillText(typed.value, pad.width / 2, pad.height / 2);
      drawn = true;
    };
    typed.oninput = render;
    fontSel.onchange = render;
    const clear = el(
      'button',
      {
        type: 'button',
        class: 'btn',
        onclick: () => {
          ctx.clearRect(0, 0, pad.width, pad.height);
          typed.value = '';
          drawn = false;
        },
      },
      'Clear',
    );
    const body = el(
      'div',
      { style: { display: 'grid', gap: '10px' } },
      el('p', {}, 'Draw your signature with a mouse, finger or stylus, or type it.'),
      pad,
      el('div', { class: 'row' }, typed, fontSel, colorInp, clear),
    );
    const r = await UI.modal({ title: 'Signature', body, ok: 'Place signature', wide: true });
    if (!r || !drawn) return;
    // trim transparent edges
    const d = ctx.getImageData(0, 0, pad.width, pad.height).data;
    let x0 = pad.width,
      y0 = pad.height,
      x1 = 0,
      y1 = 0;
    for (let y = 0; y < pad.height; y++)
      for (let x = 0; x < pad.width; x++)
        if (d[(y * pad.width + x) * 4 + 3] > 10) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 <= x0) return;
    const c = el('canvas', { width: x1 - x0 + 16, height: y1 - y0 + 16 });
    c.getContext('2d').drawImage(pad, x0 - 8, y0 - 8, c.width, c.height, 0, 0, c.width, c.height);
    pending = { src: c.toDataURL('image/png'), aspect: c.width / c.height, w: 0.25 };
    setTool('place');
    UI.toast('Click on a page to place your signature');
  }

  /* --- page operations --- */
  function rotateAnnots(p, dir) {
    // shortcut: a turned page drops its OCR layer instead of turning the words; run OCR again.
    if (p.ocr) {
      delete p.ocr;
      UI.toast('Turning a page removes its recognized text. Run Recognize text again.');
    }
    // keep annotations in place when the page turns
    const f = dir > 0 ? ([u, v]) => [1 - v, u] : ([u, v]) => [v, 1 - u];
    p.annots.forEach((a) => {
      if (a.type === 'ink') a.points = a.points.map(f);
      else if (a.type === 'text') {
        [a.x, a.y] = f([a.x, a.y]);
        if (a.cover) {
          const c = a.cover;
          const [x1, y1] = f([c.x, c.y]),
            [x2, y2] = f([c.x + c.w, c.y + c.h]);
          a.cover = {
            ...c,
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            w: Math.abs(x2 - x1),
            h: Math.abs(y2 - y1),
          };
        }
      } else {
        const [x1, y1] = f([a.x, a.y]),
          [x2, y2] = f([a.x + a.w, a.y + a.h]);
        a.x = Math.min(x1, x2);
        a.y = Math.min(y1, y2);
        a.w = Math.abs(x2 - x1);
        a.h = Math.abs(y2 - y1);
      }
    });
  }
  async function pageOp(a) {
    if (!pages.length && !['new'].includes(a)) return;
    const T = targets();
    switch (a) {
      case 'rotL':
      case 'rotR':
        pushHist();
        T.forEach((p) => {
          const d = a === 'rotR' ? 90 : -90;
          p.rot += d;
          rotateAnnots(p, d);
        });
        renderAll();
        break;
      case 'del':
        if (T.length >= pages.length) return UI.toast('A PDF needs at least one page.', true);
        pushHist();
        pages = pages.filter((p) => !T.includes(p));
        selPages.clear();
        renderAll();
        UI.toast(`Deleted ${T.length} page${T.length > 1 ? 's' : ''}`);
        break;
      case 'dup':
        pushHist();
        T.slice()
          .reverse()
          .forEach((p) => {
            const i = pages.indexOf(p);
            pages.splice(i + 1, 0, {
              ...p,
              id: uid(),
              annots: JSON.parse(JSON.stringify(p.annots)).map((x) => ({ ...x, id: uid() })),
            });
          });
        renderAll();
        break;
      case 'blank': {
        pushHist();
        const p = curPage();
        const [np] = await blankPages(p ? p.w : 612, p ? p.h : 792);
        pages.splice(cur + 1, 0, np);
        cur++;
        renderAll();
        break;
      }
      case 'up':
      case 'down': {
        pushHist();
        const d = a === 'up' ? -1 : 1;
        const idxs = T.map((p) => pages.indexOf(p)).sort((x, y) => d * (y - x));
        for (const i of idxs) {
          const j = i + d;
          if (j < 0 || j >= pages.length) continue;
          [pages[i], pages[j]] = [pages[j], pages[i]];
        }
        cur = clamp(cur + d, 0, pages.length - 1);
        renderAll();
        break;
      }
      case 'reverse':
        pushHist();
        pages.reverse();
        renderAll();
        break;
      case 'selAll':
        pages.forEach((p) => selPages.add(p.id));
        renderAll();
        break;
      case 'clearAnn':
        if (curPage()) {
          pushHist();
          curPage().annots = [];
          selAnn = null;
          renderAnnots(curPage());
        }
        break;
    }
  }
  function zoomTo(s) {
    scale = clamp(s, 0.3, 5);
    renderAll();
  }
  function fitWidth() {
    if (!pages.length) return;
    const maxW = Math.max(...pages.map((p) => disp(p)[0]));
    zoomTo(Math.min(2.5, (desk.clientWidth - 48) / maxW));
  }

  /* --- build the output PDF --- */
  const hexRgb = (h) => {
    const n = parseInt((h || '#000000').slice(1), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  let replaced = new Set(); // characters that could not be drawn in the last saved PDF
  async function libFor(src) {
    const fv = formValues.get(src);
    if (fv && Object.keys(fv).length) {
      // fill + flatten a fresh copy
      const lib = await PDFLib.PDFDocument.load(src.bytes, { ignoreEncryption: true });
      const form = lib.getForm();
      for (const [k, v] of Object.entries(fv)) {
        try {
          const f = form.getField(k);
          if (f instanceof PDFLib.PDFTextField) f.setText(String(v));
          else if (f instanceof PDFLib.PDFCheckBox) v ? f.check() : f.uncheck();
          else if (f instanceof PDFLib.PDFDropdown || f instanceof PDFLib.PDFOptionList) v && f.select(v);
          else if (f instanceof PDFLib.PDFRadioGroup) v && f.select(v);
        } catch (e) {
          console.warn('field', k, e);
        }
      }
      try {
        form.flatten();
      } catch (e) {
        console.warn(e);
      }
      return lib;
    }
    return src.lib || (src.lib = await PDFLib.PDFDocument.load(src.bytes, { ignoreEncryption: true }));
  }
  async function build(list = pages) {
    const { PDFDocument, degrees, rgb, BlendMode, LineCapStyle } = PDFLib;
    const out = await PDFDocument.create();
    const imgs = new Map();
    const libs = new Map();
    const F = Formats.pdfFonts(out);
    const pick = F.pick;
    replaced = F.replaced;
    for (const s of new Set(list.map((p) => p.src))) libs.set(s, await libFor(s));
    const total = list.length;
    for (let n = 0; n < list.length; n++) {
      const p = list[n];
      const [pg] = await out.copyPages(libs.get(p.src), [p.idx]);
      out.addPage(pg);
      const r = rot(p);
      pg.setRotation(degrees(r));
      const cb = pg.getCropBox();
      const W = cb.width,
        H = cb.height,
        ox = cb.x,
        oy = cb.y;
      const dW = r % 180 ? H : W,
        dH = r % 180 ? W : H;
      const P = (u, v) =>
        r === 0
          ? [ox + u * W, oy + (1 - v) * H]
          : r === 90
            ? [ox + v * W, oy + u * H]
            : r === 180
              ? [ox + (1 - u) * W, oy + v * H]
              : [ox + (1 - v) * W, oy + (1 - u) * H];
      const drawStr = async (text, u, v, size, fk, color, opacity = 1, extraRot = 0) => {
        const { f, t } = await pick(text, fk);
        const [x, y] = P(u, v);
        pg.drawText(t, {
          x,
          y,
          size,
          font: f,
          color,
          opacity,
          rotate: degrees(r + extraRot),
          lineHeight: size * 1.2,
        });
      };
      // Recognized text: invisible, sized to cover each word, so search and selection line up.
      for (const [t, u, v, w, h] of p.ocr || []) {
        const { f, t: tt } = await pick(t, 'Helvetica');
        const size = Math.min(h * dH * 1.5, (w * dW) / Math.max(0.01, f.widthOfTextAtSize(tt, 1)));
        await drawStr(t, u, v + h * 0.8, size, 'Helvetica', rgb(0, 0, 0), 0);
      }
      for (const a of p.annots) {
        if (a.type === 'text' && a.cover) {
          const c = a.cover;
          const [x1, y1] = P(c.x, c.y),
            [x2, y2] = P(c.x + c.w, c.y + c.h);
          pg.drawRectangle({
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
            color: hexRgb(c.bg),
          });
          if (!a.text) continue;
        }
        if (a.type === 'text') {
          const fk = a.font.startsWith('user:') ? a.font : a.font + (a.bold ? 'Bold' : '');
          await drawStr(
            a.text,
            a.x,
            a.y + ((a.font === 'Courier' ? 0.87 : 0.93) * a.size) / dH,
            a.size,
            fk,
            hexRgb(a.color),
          );
          continue;
        }
        if (a.type === 'ink') {
          const d = a.points
            .map(([u, v], i) => {
              const [x, y] = P(u, v);
              return (i ? 'L' : 'M') + x.toFixed(2) + ' ' + (-y).toFixed(2);
            })
            .join(' ');
          pg.drawSvgPath(d, {
            x: 0,
            y: 0,
            borderColor: hexRgb(a.color),
            borderWidth: a.width,
            borderLineCap: LineCapStyle.Round,
          });
          continue;
        }
        const [x1, y1] = P(a.x, a.y),
          [x2, y2] = P(a.x + a.w, a.y + a.h);
        const x = Math.min(x1, x2),
          y = Math.min(y1, y2),
          w = Math.abs(x2 - x1),
          h = Math.abs(y2 - y1);
        if (a.type === 'highlight')
          pg.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            color: hexRgb(a.color),
            opacity: 0.38,
            blendMode: BlendMode.Multiply,
          });
        else if (a.type === 'whiteout') pg.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
        else if (a.type === 'rect')
          pg.drawRectangle({ x, y, width: w, height: h, borderColor: hexRgb(a.color), borderWidth: a.width });
        else if (a.type === 'ellipse')
          pg.drawEllipse({
            x: x + w / 2,
            y: y + h / 2,
            xScale: w / 2,
            yScale: h / 2,
            borderColor: hexRgb(a.color),
            borderWidth: a.width,
          });
        else if (a.type === 'image') {
          let im = imgs.get(a.src);
          if (!im) {
            const d = Img.get(a.src);
            im = d.startsWith('data:image/jpeg')
              ? await out.embedJpg(dataURLtoBytes(d))
              : await out.embedPng(dataURLtoBytes(d));
            imgs.set(a.src, im);
          }
          const [bx, by] = P(a.x, a.y + a.h);
          pg.drawImage(im, { x: bx, y: by, width: a.w * dW, height: a.h * dH, rotate: degrees(r) });
        }
      }
      const wm = settings.watermark;
      if (wm && wm.text) {
        const { f, t: wt } = await pick(wm.text, 'HelveticaBold');
        const tw = f.widthOfTextAtSize(wt, wm.size);
        const th = (rad) => (rad * Math.PI) / 180;
        const [cx, cy] = P(0.5, 0.5);
        const t = th(r + wm.angle);
        const dx = (Math.cos(t) * tw) / 2 - Math.sin(t) * wm.size * 0.35,
          dy = (Math.sin(t) * tw) / 2 + Math.cos(t) * wm.size * 0.35;
        pg.drawText(wt, {
          x: cx - dx,
          y: cy - dy,
          size: wm.size,
          font: f,
          color: hexRgb(wm.color),
          opacity: wm.opacity,
          rotate: degrees(r + wm.angle),
        });
      }
      const label = async (text, pos, size) => {
        // pos like 'bc','tr'
        const { f, t: lt } = await pick(text, 'Helvetica');
        const tw = f.widthOfTextAtSize(lt, size);
        const m = 36;
        const v = pos[0] === 'b' ? 1 - m / dH : (m + size) / dH;
        const u = pos[1] === 'c' ? 0.5 - tw / 2 / dW : pos[1] === 'r' ? 1 - (m + tw) / dW : m / dW;
        await drawStr(text, u, v, size, 'Helvetica', rgb(0.25, 0.27, 0.3));
      };
      const nb = settings.numbers;
      if (nb && n + 1 >= nb.from)
        await label(
          nb.fmt.replace('{n}', n + nb.start).replace('{total}', total + nb.start - 1),
          nb.pos,
          nb.size,
        );
      const hd = settings.header;
      if (hd && hd.text)
        await label(
          hd.text.replace('{date}', new Date().toLocaleDateString()).replace('{file}', name),
          hd.pos,
          hd.size,
        );
    }
    if (meta.title) out.setTitle(meta.title);
    if (meta.author) out.setAuthor(meta.author);
    if (meta.subject) out.setSubject(meta.subject);
    if (meta.keywords)
      out.setKeywords(
        meta.keywords
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    out.setProducer('Offline Office');
    out.setModificationDate(new Date());
    return out.save();
  }
  async function exportPdf(list, fname) {
    if (!pages.length) return UI.toast('Open a PDF first.', true);
    const done = UI.busy('Saving PDF…');
    try {
      const bytes = await build(list);
      warnReplaced(replaced);
      const ok = await saveFile(fname || name + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
      if (!list) savedWhole('pdf', ok);
    } catch (e) {
      console.error(e);
      UI.toast('Could not save PDF: ' + e.message, true);
    } finally {
      done();
    }
  }
  async function renderBytesToImages(bytes, s = 2) {
    const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale: s });
      const c = el('canvas', { width: vp.width, height: vp.height });
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      out.push(await new Promise((r) => c.toBlob(r, 'image/png')));
    }
    return out;
  }
  async function extractText() {
    const parts = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const pg = await p.src.pdf.getPage(p.idx + 1);
      const tc = await pg.getTextContent();
      let s = '';
      for (const it of tc.items) {
        s += it.str;
        if (it.hasEOL) s += '\n';
      }
      // Recognized words: a new line wherever a word starts below the previous one.
      if (!s.trim() && p.ocr)
        p.ocr.forEach(([t, , v, , h], j) => (s += (j && v > p.ocr[j - 1][2] + h * 0.6 ? '\n' : ' ') + t));
      parts.push(s.trim());
    }
    return parts;
  }
  // Reads the text on pages that have none (scans, photos) and lays it invisibly over the page, so the
  // saved PDF can be searched and copied. Returns how many pages were read.
  async function ocrPages(list = pages) {
    const langs = await Mods.addons.pickLangs();
    if (!langs) return 0;
    const msg = el('span', {}, 'Loading text recognition…');
    const bg = el('div', { class: 'busy' }, el('div', {}, el('span', { class: 'spin' }), msg));
    document.body.append(bg);
    let n = 0;
    try {
      for (const [i, p] of list.entries()) {
        if (p.ocr) continue;
        const pg = await p.src.pdf.getPage(p.idx + 1);
        if ((await pg.getTextContent()).items.some((it) => it.str.trim())) continue;
        // 2× is 144 dpi for a normal page, enough for body text.
        const vp = pg.getViewport({ scale: 2, rotation: rot(p) });
        const c = el('canvas', { width: Math.floor(vp.width), height: Math.floor(vp.height) });
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        const { words } = await Formats.ocr(c, langs, (f) => {
          msg.textContent = `Reading page ${i + 1} of ${list.length}… ${Math.round(f * 100)}%`;
        });
        p.ocr = words
          .filter((w) => w.text.trim())
          .map((w) => [
            w.text,
            w.x0 / c.width,
            w.y0 / c.height,
            (w.x1 - w.x0) / c.width,
            (w.y1 - w.y0) / c.height,
          ]);
        n++;
      }
    } finally {
      bg.remove();
    }
    return n;
  }

  /* --- tool dialogs --- */
  async function tools(a) {
    if (!pages.length) return UI.toast('Open a PDF first.', true);
    if (a === 'watermark') {
      const w = settings.watermark || {
        text: 'CONFIDENTIAL',
        size: 64,
        opacity: 0.18,
        color: '#c0392b',
        angle: 45,
      };
      const r = await UI.modal({
        title: 'Watermark',
        text: 'Stamped on every page when you save.',
        fields: [
          { id: 'text', label: 'Text', value: w.text },
          { id: 'size', label: 'Size (pt)', type: 'number', value: w.size, min: 8, max: 200 },
          {
            id: 'opacity',
            label: 'Opacity (0–1)',
            type: 'number',
            value: w.opacity,
            min: 0.02,
            max: 1,
            step: 0.01,
          },
          { id: 'angle', label: 'Angle (degrees)', type: 'number', value: w.angle, min: -90, max: 90 },
          { id: 'color', label: 'Color', type: 'color', value: w.color },
        ],
        extra: settings.watermark ? [{ label: 'Remove', value: 'rm' }] : null,
        ok: 'Apply',
      });
      if (r) {
        settings.watermark = r._extra === 'rm' ? null : r;
        UI.toast(r._extra === 'rm' ? 'Watermark removed' : 'Watermark will be added when you save');
      }
    }
    if (a === 'numbers') {
      const nb = settings.numbers || { fmt: 'Page {n} of {total}', pos: 'bc', size: 10, start: 1, from: 1 };
      const r = await UI.modal({
        title: 'Page numbers',
        text: 'Use {n} for the page number and {total} for the page count.',
        fields: [
          { id: 'fmt', label: 'Format', value: nb.fmt },
          {
            id: 'pos',
            label: 'Position',
            type: 'select',
            value: nb.pos,
            options: [
              ['bc', 'Bottom center'],
              ['br', 'Bottom right'],
              ['bl', 'Bottom left'],
              ['tc', 'Top center'],
              ['tr', 'Top right'],
              ['tl', 'Top left'],
            ],
          },
          { id: 'size', label: 'Size (pt)', type: 'number', value: nb.size, min: 6, max: 36 },
          { id: 'start', label: 'First number', type: 'number', value: nb.start, min: 0 },
          { id: 'from', label: 'Start on page', type: 'number', value: nb.from, min: 1 },
        ],
        extra: settings.numbers ? [{ label: 'Remove', value: 'rm' }] : null,
        ok: 'Apply',
      });
      if (r) {
        settings.numbers = r._extra === 'rm' ? null : r;
        UI.toast(r._extra === 'rm' ? 'Page numbers removed' : 'Page numbers will be added when you save');
      }
    }
    if (a === 'header') {
      const hd = settings.header || { text: '{file} · {date}', pos: 'tl', size: 9 };
      const r = await UI.modal({
        title: 'Header / footer text',
        text: 'Placeholders: {file}, {date}.',
        fields: [
          { id: 'text', label: 'Text', value: hd.text },
          {
            id: 'pos',
            label: 'Position',
            type: 'select',
            value: hd.pos,
            options: [
              ['tl', 'Header left'],
              ['tc', 'Header center'],
              ['tr', 'Header right'],
              ['bl', 'Footer left'],
              ['bc', 'Footer center'],
              ['br', 'Footer right'],
            ],
          },
          { id: 'size', label: 'Size (pt)', type: 'number', value: hd.size, min: 6, max: 36 },
        ],
        extra: settings.header ? [{ label: 'Remove', value: 'rm' }] : null,
        ok: 'Apply',
      });
      if (r) settings.header = r._extra === 'rm' ? null : r;
    }
    if (a === 'meta') {
      const r = await UI.modal({
        title: 'Document properties',
        fields: [
          { id: 'title', label: 'Title', value: meta.title || '' },
          { id: 'author', label: 'Author', value: meta.author || '' },
          { id: 'subject', label: 'Subject', value: meta.subject || '' },
          { id: 'keywords', label: 'Keywords (comma separated)', value: meta.keywords || '' },
          { id: 'fname', label: 'File name', value: name },
        ],
        ok: 'Save properties',
      });
      if (r) {
        name = r.fname || name;
        delete r.fname;
        meta = r;
        status();
      }
    }
    if (a === 'forms') {
      const body = el('div', { style: { display: 'grid', gap: '10px' } });
      const inputs = [];
      const used = [...new Set(pages.map((p) => p.src))];
      for (const src of used) {
        let form;
        try {
          form = (
            src.lib || (src.lib = await PDFLib.PDFDocument.load(src.bytes, { ignoreEncryption: true }))
          ).getForm();
        } catch {
          continue;
        }
        const fv = formValues.get(src) || {};
        for (const f of form.getFields()) {
          const nm = f.getName();
          let inp;
          if (f instanceof PDFLib.PDFTextField) {
            inp = el('input', { type: 'text', class: 'ctl', style: { width: '100%' } });
            inp.value = fv[nm] ?? (f.getText() || '');
          } else if (f instanceof PDFLib.PDFCheckBox)
            inp = el('input', { type: 'checkbox', checked: fv[nm] ?? f.isChecked() });
          else if (
            f instanceof PDFLib.PDFDropdown ||
            f instanceof PDFLib.PDFOptionList ||
            f instanceof PDFLib.PDFRadioGroup
          ) {
            const opts = f.getOptions();
            const curv = fv[nm] ?? (f.getSelected ? [].concat(f.getSelected())[0] : '');
            inp = el(
              'select',
              { class: 'ctl' },
              el('option', { value: '' }, '—'),
              ...opts.map((o) => el('option', { value: o, selected: o === curv }, o)),
            );
          } else continue;
          inputs.push({ src, nm, inp });
          body.append(el('div', { class: 'field' }, el('label', { class: 'lbl' }, nm), inp));
        }
      }
      if (!inputs.length)
        return UI.toast('This PDF has no fillable form fields. Use the Text tool to type on it instead.');
      const r = await UI.modal({
        title: 'Fill form fields',
        text: 'Values are written into the fields and flattened when you save.',
        body,
        ok: 'Apply',
        wide: true,
      });
      if (r) {
        inputs.forEach(({ src, nm, inp }) => {
          const m = formValues.get(src) || {};
          m[nm] = inp.type === 'checkbox' ? inp.checked : inp.value;
          formValues.set(src, m);
        });
        UI.toast('Form values saved. They are applied when you save the PDF.');
      }
    }
  }
  async function act(a) {
    if (['rotL', 'rotR', 'del', 'dup', 'blank', 'up', 'down', 'reverse', 'selAll', 'clearAnn'].includes(a))
      return pageOp(a);
    if (['watermark', 'numbers', 'header', 'meta', 'forms'].includes(a)) return tools(a);
    switch (a) {
      case 'open':
        return open();
      case 'merge': {
        const fs = await pickFiles('.pdf,image/*', true);
        if (fs.length) append(fs);
        break;
      }
      case 'new':
        if (
          pages.length &&
          !(await UI.confirm(
            'Start a new PDF?',
            'Unsaved changes to the current PDF will be lost.',
            'New PDF',
          ))
        )
          return;
        sources = [];
        pages = await blankPages();
        name = 'Untitled';
        meta = {};
        settings = { watermark: null, numbers: null, header: null };
        formValues = new Map();
        selPages.clear();
        renderAll();
        requestAnimationFrame(fitWidth);
        break;
      case 'export':
        return exportPdf();
      case 'ocr': {
        if (!pages.length) return UI.toast('Open a PDF first.', true);
        const n = await ocrPages(selPages.size ? targets() : pages);
        if (n) unsaved.add('pdf');
        return UI.toast(
          n
            ? `Read the text on ${n} page${n > 1 ? 's' : ''}. Save the PDF to keep it searchable.`
            : 'Every page already has text.',
        );
      }
      case 'example':
        if (!(await replaceOk(pages.length > 0))) return;
        {
          const d = UI.busy('Building example…');
          try {
            formValues = new Map();
            settings = { watermark: null, numbers: null, header: null };
            selPages.clear();
            undoStack = [];
            await sample();
          } finally {
            d();
          }
        }
        return;
      case 'exportSel': {
        const T = targets();
        return exportPdf(T, `${name} (pages ${T.map((p) => pages.indexOf(p) + 1).join(',')}).pdf`);
      }
      case 'split': {
        if (!pages.length) return;
        const done = UI.busy('Splitting…');
        try {
          const z = new JSZip();
          for (let i = 0; i < pages.length; i++)
            z.file(`${name}-page-${String(i + 1).padStart(3, '0')}.pdf`, await build([pages[i]]));
          await saveFile(name + '-pages.zip', await z.generateAsync({ type: 'blob' }));
        } catch (e) {
          UI.toast(e.message, true);
        } finally {
          done();
        }
        break;
      }
      case 'images': {
        if (!pages.length) return;
        const done = UI.busy('Rendering pages…');
        try {
          const list = targets().length > 1 ? targets() : pages;
          const imgs = await renderBytesToImages(await build(list));
          const z = new JSZip();
          imgs.forEach((b, i) => z.file(`${name}-${String(i + 1).padStart(3, '0')}.png`, b));
          await saveFile(name + '-images.zip', await z.generateAsync({ type: 'blob' }));
        } catch (e) {
          UI.toast(e.message, true);
        } finally {
          done();
        }
        break;
      }
      case 'text':
      case 'toDoc': {
        if (!pages.length) return;
        const done = UI.busy('Reading text…');
        try {
          let parts = await extractText();
          if (
            !parts.join('').trim() &&
            (await UI.confirm(
              'No text in this PDF',
              'It looks like scanned pages. Read the text with OCR? This takes a few seconds per page.',
              'Run OCR',
            ))
          ) {
            done();
            await ocrPages();
            parts = await extractText();
          }
          if (!parts.join('').trim()) {
            UI.toast('No text found. The pages may be blank or the scan too faint.', true);
            return;
          }
          if (a === 'text')
            Mods.text.setContent(
              parts.map((s, i) => `--- Page ${i + 1} ---\n${s}`).join('\n\n'),
              name + '.txt',
            );
          else
            Mods.doc.fromHtml(
              parts
                .map((s) =>
                  s
                    .split(/\n{2,}|\n(?=[A-Z0-9•\-])/)
                    .map((x) => `<p>${esc(x.replace(/\n/g, ' '))}</p>`)
                    .join(''),
                )
                .join('<div class="page-break" contenteditable="false"></div>'),
              name,
            );
        } finally {
          done();
        }
        break;
      }
      case 'image': {
        const [f] = await pickFiles('image/*');
        if (!f) return;
        let src = await readAs(f, 'url');
        if (!/^data:image\/(png|jpeg)/.test(src)) {
          const im = await loadImg(src);
          const c = el('canvas', { width: im.width, height: im.height });
          c.getContext('2d').drawImage(im, 0, 0);
          src = c.toDataURL('image/png');
        }
        placeImage(src);
        break;
      }
      case 'sign':
        return signature();
      case 'zoomIn':
        return zoomTo(scale * 1.2);
      case 'zoomOut':
        return zoomTo(scale / 1.2);
      case 'fit':
        return fitWidth();
    }
  }
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (b) act(b.dataset.a);
  });

  async function sample() {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const d = await PDFDocument.create();
    const H = await d.embedFont(StandardFonts.Helvetica),
      HB = await d.embedFont(StandardFonts.HelveticaBold),
      T = await d.embedFont(StandardFonts.TimesRoman);
    d.setTitle('Equipment Rental Agreement (sample)');
    d.setAuthor('Northgate Tool Library');
    const p1 = d.addPage([612, 792]);
    let y = 720;
    p1.drawRectangle({ x: 0, y: 760, width: 612, height: 32, color: rgb(0.05, 0.42, 0.4) });
    p1.drawText('EXAMPLE PDF · try Edit text, Pen, Highlight and Signature', {
      x: 54,
      y: 772,
      size: 10,
      font: HB,
      color: rgb(1, 1, 1),
    });
    p1.drawText('Equipment Rental Agreement', { x: 54, y, size: 24, font: HB });
    y -= 22;
    p1.drawText('Northgate Tool Library · 18 Mill Lane · Agreement no. NTL-2026-0418', {
      x: 54,
      y,
      size: 10,
      font: H,
      color: rgb(0.35, 0.38, 0.42),
    });
    y -= 36;
    const para = (pg, text, yy, size = 11.5) => {
      const words = text.split(' ');
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (T.widthOfTextAtSize(t, size) > 504) {
          pg.drawText(line, { x: 54, y: yy, size, font: T });
          yy -= size * 1.45;
          line = w;
        } else line = t;
      }
      pg.drawText(line, { x: 54, y: yy, size, font: T });
      return yy - size * 2.2;
    };
    p1.drawText('1. Items rented', { x: 54, y, size: 13, font: HB });
    y -= 20;
    [
      ['Item', 'Serial', 'Days', 'Rate'],
      ['Cordless drill (18V)', 'CD-2291', '3', '$6.00/day'],
      ['Tile saw', 'TS-0087', '2', '$14.00/day'],
      ['Extension ladder, 6 m', 'LD-0410', '3', '$5.00/day'],
    ].forEach((r, i) => {
      [54, 250, 380, 450].forEach((x, j) => p1.drawText(r[j], { x, y, size: 11, font: i ? T : HB }));
      y -= 18;
      if (!i)
        p1.drawLine({
          start: { x: 54, y: y + 12 },
          end: { x: 558, y: y + 12 },
          thickness: 0.6,
          color: rgb(0.6, 0.6, 0.6),
        });
    });
    y -= 14;
    p1.drawText('2. Terms', { x: 54, y, size: 13, font: HB });
    y -= 20;
    y = para(
      p1,
      'The renter agrees to return all items clean and in working order by 5:00 pm on the due date. Late returns are charged at the daily rate. Damage beyond normal wear is charged at repair cost, up to the replacement value listed in the library catalogue.',
      y,
    );
    y = para(
      p1,
      'The library provides safety glasses and ear defenders with power tools. The renter confirms they have read the safety card attached to each item and will not lend the equipment to anyone else.',
      y,
    );
    p1.drawText('3. Renter details', { x: 54, y, size: 13, font: HB });
    y -= 26;
    const form = d.getForm();
    p1.drawText('Full name', { x: 54, y: y + 4, size: 10, font: H });
    const f1 = form.createTextField('renter.name');
    f1.addToPage(p1, { x: 140, y: y - 2, width: 260, height: 18 });
    y -= 28;
    p1.drawText('Phone', { x: 54, y: y + 4, size: 10, font: H });
    const f2 = form.createTextField('renter.phone');
    f2.addToPage(p1, { x: 140, y: y - 2, width: 160, height: 18 });
    y -= 28;
    const cb = form.createCheckBox('renter.safety');
    cb.addToPage(p1, { x: 54, y: y - 2, width: 14, height: 14 });
    p1.drawText('I have read the safety cards', { x: 76, y: y + 1, size: 10, font: H });
    y -= 50;
    p1.drawLine({ start: { x: 54, y }, end: { x: 290, y }, thickness: 0.8 });
    p1.drawLine({ start: { x: 330, y }, end: { x: 558, y }, thickness: 0.8 });
    p1.drawText('Renter signature', { x: 54, y: y - 14, size: 9, font: H, color: rgb(0.4, 0.4, 0.4) });
    p1.drawText('Date', { x: 330, y: y - 14, size: 9, font: H, color: rgb(0.4, 0.4, 0.4) });
    const p2 = d.addPage([612, 792]);
    let y2 = 720;
    p2.drawText('Appendix A · Return checklist', { x: 54, y: y2, size: 18, font: HB });
    y2 -= 34;
    [
      'Batteries charged and returned in their case',
      'Saw blade guard fitted and water tray emptied',
      'Ladder locks checked and feet clean',
      'All accessories returned in the original bag',
    ].forEach((t) => {
      p2.drawRectangle({
        x: 54,
        y: y2 - 2,
        width: 11,
        height: 11,
        borderColor: rgb(0.3, 0.3, 0.3),
        borderWidth: 0.8,
      });
      p2.drawText(t, { x: 76, y: y2, size: 11.5, font: T });
      y2 -= 24;
    });
    y2 -= 16;
    para(
      p2,
      'Questions about a rental? Ask at the front desk during opening hours, Tuesday to Saturday, 10:00 to 17:00.',
      y2,
    );
    const bytes = await d.save();
    sources = [];
    pages = await addSourceBytes(bytes, 'sample');
    name = 'Equipment rental agreement (example)';
    meta = { title: d.getTitle(), author: d.getAuthor() };
    renderAll();
    requestAnimationFrame(fitWidth);
  }
  return {
    load,
    open,
    act,
    append,
    text: extractText,
    hasDoc: () => pages.length > 0,
    save: () => exportPdf(),
    async onShow() {
      if (!booted) {
        booted = true;
        renderAll();
      } else if (!desk.children.length) renderAll();
    },
    async fromImage(blob, nm) {
      sources = [];
      pages = await filesToPages([new File([blob], nm, { type: blob.type })]);
      name = base(nm);
      booted = true;
      show('pdf');
      renderAll();
      requestAnimationFrame(fitWidth);
    },
  };
})();
