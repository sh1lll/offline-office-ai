// Builds single-file versions of index.html that need no network at all. Run: node build.mjs
//   dist/offline-office.html  one file to download, share or open from a USB stick
//   dist/artifact.html        the same page without <html>/<head>, for the claude.ai artifact viewer
// Every library, font and asset is embedded. The security policy allows network access only for the
// opt-in AI: a model server on this computer, or an HTTPS service the user set up.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p));
let html = readFileSync(here('index.html'), 'utf8');

// Every script and asset is stored gzipped and base64-encoded, about a third of its size, and the
// browser unpacks it with DecompressionStream. Files the app loads only when needed are read by asset()
// and loadScript() in src/; data-inflate ones are unpacked in place at start-up because the app reads
// them synchronously (the pdf.js worker).
const tag = (p, attrs, body) => `<script type="text/plain" data-file="${p}"${attrs}>${body}</script>`;
const gz = (p) => gzipSync(read(p), { level: 9 }).toString('base64');
const lazy = [
  tag('vendor/pdf.worker.min.js', ' data-base64 data-gzip data-inflate', gz('vendor/pdf.worker.min.js')),
  ...[
    'vendor/heic2any.min.js',
    'vendor/pako.min.js',
    'vendor/UTIF.js',
    'vendor/fontkit.umd.min.js',
    'vendor/anthropic-sdk.min.js',
    'vendor/tesseract.min.js',
    'vendor/tesseract-worker.min.js',
    'vendor/tesseract-core-simd-lstm.wasm.js',
    'assets/NotoSans-Regular.ttf',
    'assets/NotoSans-Bold.ttf',
  ].map((p) => tag(p, ' data-base64 data-gzip', gz(p))),
  // already gzipped; Tesseract unpacks it itself
  tag('vendor/eng.traineddata.gz', ' data-base64', read('vendor/eng.traineddata.gz').toString('base64')),
];
// Inserted first, right after <body> (inlined libraries contain '<body>' and '</body>' strings of their
// own), so the app finds them when it starts.
html = html.replace('<body>', () => '<body>\n' + lazy.join('\n'));

// App and library scripts that index.html loads up front: packed in the same order, then a small loader
// unpacks them all and runs them one after another, as the script tags would have.
const boot = [];
html = html.replace(/<script src="((?:src|vendor)\/[\w.-]+\.js)"><\/script>\n?/g, (_, p) => {
  boot.push(`<script type="text/plain" data-boot="${p}">${gz(p)}</script>`);
  return boot.length === 1 ? '<!--boot-->' : '';
});
const loader = `<script>
(async () => {
  const unpack = async (e) =>
    new TextDecoder().decode(
      await new Response(
        new Blob([Uint8Array.from(atob(e.textContent.trim()), (c) => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip')),
      ).arrayBuffer(),
    );
  for (const e of document.querySelectorAll('script[data-inflate]')) {
    e.textContent = await unpack(e);
    ['data-base64', 'data-gzip', 'data-inflate'].forEach((a) => e.removeAttribute(a));
  }
  const packs = [...document.querySelectorAll('script[data-boot]')];
  const code = await Promise.all(packs.map(unpack));
  packs.forEach((e) => e.remove());
  for (const c of code) document.body.append(Object.assign(document.createElement('script'), { text: c }));
})();
</script>`;
html = html.replace('<!--boot-->', () => boot.join('\n') + '\n' + loader);

// Styles, with every font file turned into a data URL.
const fonts = read('vendor/fonts.css')
  .toString()
  .replace(
    /url\((fonts\/[\w.-]+\.woff2)\)/g,
    (_, p) => `url(data:font/woff2;base64,${read('vendor/' + p).toString('base64')})`,
  );
html = html.replace('<link rel="stylesheet" href="vendor/fonts.css">', () => `<style>\n${fonts}</style>`);
html = html.replace(
  '<link rel="stylesheet" href="src/styles.css">',
  () => `<style>\n${read('src/styles.css')}</style>`,
);

// No 'self': a file opened from disk or as an artifact has no site of its own to load from.
html = html.replace(
  /<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; connect-src data: blob: http://localhost:* http://127.0.0.1:* http://[::1]:* https:; frame-src blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'">`,
);
if (/<(script|link)[^>]+(src|href)="(?!data:|blob:)/.test(html))
  throw new Error('a file reference was not embedded');

mkdirSync(here('dist/'), { recursive: true });
writeFileSync(here('dist/offline-office.html'), html);

// The artifact viewer supplies its own document shell, viewport and security policy.
const artifact = html
  .replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace(/<!--[^>]*-->\s*<meta http-equiv="Content-Security-Policy"[^>]*>\s*/, '')
  .replace(
    '<title>Offline Office</title>',
    '<title>Offline Office</title>\n<meta name="claude:viewport-fit-sides" content="cover">',
  )
  .replace(/<\/head>\s*<body>\s*/i, '\n')
  .replace(/\s*<\/body>\s*<\/html>\s*$/i, '\n');
writeFileSync(here('dist/artifact.html'), artifact);
console.log(
  `dist/offline-office.html ${(html.length / 1e6).toFixed(2)} MB, dist/artifact.html ${(artifact.length / 1e6).toFixed(2)} MB`,
);
