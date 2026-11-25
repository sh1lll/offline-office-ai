// Downloads every library and font into vendor/, so the app never loads anything from the network.
// Run: node vendor.mjs   (only needed to add or upgrade a dependency; vendor/ is committed)
// Each library is checked against a pinned SHA-384 hash; a mismatch stops the script.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

export const LIBS = [
  [
    'pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    '/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
  ],
  [
    'pdf.worker.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2',
  ],
  [
    'pdf-lib.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    'weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI',
  ],
  [
    'jszip.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    '+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG',
  ],
  [
    'mammoth.browser.min.js',
    'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js',
    'nFoSjZIoH3CCp8W639jJyQkuPHinJ2NHe7on1xvlUA7SuGfJAfvMldrsoAVm6ECz',
  ],
  [
    'docx.umd.js',
    'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',
    '4xaIisuLEy2lo2HkB2C4rEf7v8jbTb2kuogX6TkuEt9feTWKBSFSOzsqNNbV+sKh',
  ],
  [
    'pptxgen.bundle.js',
    'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
    'Cck14aA9cifjYolcnjebXRfWGkz5ltHMBiG4px/j8GS+xQcb7OhNQWZYyWjQ+UwQ',
  ],
  [
    'xlsx.full.min.js',
    'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    'EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT',
  ],
  [
    'marked.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js',
    'odPBjvtXVM/5hOYIr3A1dB+flh0c3wAT3bSesIOqEGmyUA4JoKf/YTWy0XKOYAY7',
  ],
  [
    'purify.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.6/purify.min.js',
    'JEyTNhjM6R1ElGoJns4U2Ln4ofPcqzSsynQkmEc/KGy6336qAZl70tDLufbkla+3',
  ],
  [
    'html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H',
  ],
  // loaded only when needed
  [
    'heic2any.min.js',
    'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
    'OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL',
  ],
  [
    'pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
    'rNlaE5fs9dGIjmxWDALQh/RBAaGRYT5ChrzHo6tRfgrZ36iRFAiquP5g41Jsv+0j',
  ],
  [
    'UTIF.js',
    'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js',
    'RyBmXHdfZ/Uon+ud+/AqSyWpUWnKYt2tkRG/P4gWoRUGDU+qIAV3tGBPNlYTBZEF',
  ],
  [
    'fontkit.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
    '2p6U+1mmqF10USehFeRiyG2ESG9FwIqN+jxULn5w9jjQIihSn9Pt13dVCn/Hawjn',
  ],
  // OCR: Tesseract with the compact ("fast") English model. Files ending in .gz are stored gzipped;
  // the hash is of the original file.
  [
    'tesseract.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    'GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F',
  ],
  [
    'tesseract-worker.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    'zxn+VqofFzXpH99dUb3fa4ywoSBQJPy6/6oEaJHPlblZXr53a0g1Jl6720vgSzB7',
  ],
  [
    'tesseract-core-simd-lstm.wasm.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js',
    'YM1G+zaWYy9VSRP2C101LCgzh7n3Hqb6OEm9qDoZYgCADsni3nnECskC3WialQB7',
  ],
  [
    'eng.traineddata.gz',
    'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/eng.traineddata',
    'uqITnPoYBbyaWUqYeiiQSy6HolADUMqvhbmwtoB2frlB0ViQLTtIqO8ap1zgmmLT',
  ],
];
// vendor/anthropic-sdk.min.js is the official Anthropic SDK (@anthropic-ai/sdk 1.14.0) bundled for the
// browser, used only by the opt-in AI. To rebuild it: npm install @anthropic-ai/sdk@1.14.0 esbuild, then
// bundle `import Anthropic from '@anthropic-ai/sdk'; window.Anthropic = Anthropic;` with
// esbuild --bundle --minify --format=iife --platform=browser --target=es2020 --legal-comments=eof.
// Interface fonts and photo-text fonts. Only Latin and Latin Extended are kept; other scripts fall back
// to the system font.
const FONTS_CSS =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Anton&family=Bebas+Neue&family=Pacifico&family=Permanent+Marker&family=Playfair+Display:wght@400;700&display=swap';
const FONT_LICENSES = {
  'IBM Plex Sans': 'ofl/ibmplexsans/OFL.txt',
  'IBM Plex Mono': 'ofl/ibmplexmono/OFL.txt',
  'Bricolage Grotesque': 'ofl/bricolagegrotesque/OFL.txt',
  Caveat: 'ofl/caveat/OFL.txt',
  'Dancing Script': 'ofl/dancingscript/OFL.txt',
  Anton: 'ofl/anton/OFL.txt',
  'Bebas Neue': 'ofl/bebasneue/OFL.txt',
  Pacifico: 'ofl/pacifico/OFL.txt',
  'Permanent Marker': 'apache/permanentmarker/LICENSE.txt',
  'Playfair Display': 'ofl/playfairdisplay/OFL.txt',
};

const here = (p) => new URL(p, import.meta.url);
const get = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(here('vendor/fonts/licenses/'), { recursive: true });
  for (const [file, url, hash] of LIBS) {
    const path = here('vendor/' + file);
    const gz = file.endsWith('.gz');
    const buf = existsSync(path) ? (gz ? gunzipSync : (b) => b)(readFileSync(path)) : await get(url);
    if (createHash('sha384').update(buf).digest('base64') !== hash)
      throw new Error(`${file} does not match its pinned hash`);
    writeFileSync(path, gz ? gzipSync(buf, { level: 9 }) : buf);
    console.log('ok', file, (buf.length / 1024).toFixed(0) + ' KB');
  }
  // A current browser user agent makes Google Fonts answer with WOFF2.
  const ua = {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  };
  const css = (await get(FONTS_CSS, ua)).toString();
  let out =
    '/* Self-hosted copies of Google Fonts (Latin and Latin Extended). Licenses in fonts/licenses/. */\n';
  for (const [, subset, block] of css.matchAll(/\/\* ([\w-]+) \*\/\s*(@font-face \{[^}]+\})/g)) {
    if (subset !== 'latin' && subset !== 'latin-ext') continue;
    const fam = /font-family: '([^']+)'/.exec(block)[1],
      style = /font-style: (\w+)/.exec(block)[1],
      weight = /font-weight: ([\d ]+)/.exec(block)[1].replace(' ', '-');
    const url = /url\((https:[^)]+)\)/.exec(block)[1];
    const name = `${fam.replace(/ /g, '')}-${weight}-${style}-${subset}.woff2`;
    if (!existsSync(here('vendor/fonts/' + name)))
      writeFileSync(here('vendor/fonts/' + name), await get(url));
    out += `/* ${subset} */\n` + block.replace(url, `fonts/${name}`) + '\n';
  }
  writeFileSync(here('vendor/fonts.css'), out);
  for (const [fam, path] of Object.entries(FONT_LICENSES))
    writeFileSync(
      here(`vendor/fonts/licenses/${fam.replace(/ /g, '')}.txt`),
      await get('https://raw.githubusercontent.com/google/fonts/main/' + path),
    );
  console.log('fonts written');
}
