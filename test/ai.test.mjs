// AI tests in real Chrome against fake model servers on this machine, so no real service is called:
// the setup steps, the risk checkbox, the Claude path (official SDK), the OpenAI-compatible path, a
// document edit, the ask-before-sending step, and turning AI off. Needs Chrome; skipped without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { CHROME, open } from './chrome.mjs';

// One fake server that speaks both protocols and records what it was sent.
function fakeModels() {
  const seen = [];
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ path: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      const sse = (events) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        for (const e of events) res.write(e);
        res.end();
      };
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(
          JSON.stringify({
            data: [
              { id: 'fake-model', type: 'model', display_name: 'Fake', created_at: '2026-01-01T00:00:00Z' },
            ],
            has_more: false,
            first_id: 'fake-model',
            last_id: 'fake-model',
          }),
        );
      }
      if (req.url === '/v1/chat/completions') {
        const user = JSON.parse(body).messages.at(-1).content;
        const reply = /OK/.test(user) ? 'OK' : 'Rewritten by the local model.';
        return sse([
          ...reply
            .split(/(?= )/)
            .map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`),
          'data: [DONE]\n\n',
        ]);
      }
      if (req.url.startsWith('/v1/messages')) {
        const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
        const msg = {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 0 },
        };
        return sse([
          ev('message_start', { message: msg }),
          ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
          ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Hello from ' } }),
          ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Claude.' } }),
          ev('content_block_stop', { index: 0 }),
          ev('message_delta', {
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 4 },
          }),
          ev('message_stop', {}),
        ]);
      }
      res.writeHead(404).end();
    });
  });
  return new Promise((r) =>
    server.listen(0, '127.0.0.1', () =>
      r({ server, seen, url: `http://127.0.0.1:${server.address().port}` }),
    ),
  );
}

const wait = `const until = async (f, ms = 5000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out: ' + f); await sleep(25); } };
  const click = (label) => { const b = [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === label); if (!b) throw new Error('no button ' + label); b.click(); };`;

test(
  'AI is opt-in, warns before online use, and works with local and Claude',
  { skip: !CHROME && 'Chrome not found', timeout: 120000 },
  async () => {
    const fake = await fakeModels();
    const app = await open('index.html');
    try {
      // 1. Off by default: no AI buttons, header says Set up AI.
      let r = await app.run(
        `return { head: $('#aiBtn').textContent.trim(), tools: $$('[data-ai]').filter((x) => !x.hidden).length };`,
      );
      assert.deepEqual(r, { head: 'Set up AI', tools: 0 });

      // 2. An online service cannot be connected without ticking the risk box.
      r = await app.run(`${wait}
      $('#aiBtn').click();
      document.querySelector('input[value="openai"]').checked = true; click('Continue');
      await until(() => document.querySelector('#aiAccept'));
      const next = [...document.querySelectorAll('.modal button')].find((x) => x.textContent === 'Continue');
      const lockedBefore = next.disabled;
      const box = document.querySelector('#aiAccept'); box.checked = true; box.dispatchEvent(new Event('change'));
      const r = { lockedBefore, lockedAfter: next.disabled, warning: document.querySelector('.ai-risks').textContent.includes("OpenAI's servers") };
      $$('.modal-bg').forEach((m) => m.remove());
      return r;`);
      assert.deepEqual(r, { lockedBefore: true, lockedAfter: false, warning: true });

      // 3. Full setup of a local server: choose, info, connect, load models, test, turn on.
      r = await app.run(`${wait}
      $('#aiBtn').click();
      document.querySelector('input[value="localOther"]').checked = true; click('Continue');
      await until(() => document.querySelector('.ai-tips')); click('Continue');
      const addr = [...document.querySelectorAll('.modal input.ctl')][0]; addr.value = '${fake.url}/v1';
      click('Load models'); await until(() => /models found/.test($('.ai-msg').textContent));
      const model = [...document.querySelectorAll('.modal input.ctl')].at(-1).value;
      click('Continue'); await until(() => [...document.querySelectorAll('.modal button')].some((b) => b.textContent === 'Run the test'));
      click('Run the test'); await until(() => /It works/.test($('.ai-msg').textContent));
      click('Turn on AI');
      return { model, head: $('#aiBtn').textContent.trim(), tools: $$('[data-ai]').filter((x) => !x.hidden).length };`);
      assert.deepEqual(r, { model: 'fake-model', head: 'AI · local', tools: 4 });

      // 4. A local model rewrites the selected text in Documents, with no confirm step.
      r = await app.run(`${wait}
      show('doc'); Mods.doc.fromHtml('<p>first para</p><p>teh second para</p>', 'ai test');
      const p = $$('#docPage p')[1]; const rg = document.createRange(); rg.selectNodeContents(p);
      getSelection().removeAllRanges(); getSelection().addRange(rg);
      document.querySelector('[data-ai="doc"]').click();
      await until(() => document.querySelector('.ai-input'));
      document.querySelector('.ai-input').value = 'Fix spelling'; click('Ask');
      await until(() => [...document.querySelectorAll('.modal button')].some((b) => b.textContent === 'Replace selection'));
      click('Replace selection');
      return $('#docPage').innerText;`);
      assert.match(r, /first para/);
      assert.match(r, /Rewritten by the local model\./);
      assert.doesNotMatch(r, /teh second/);

      // 5. Claude through the official SDK, with server-side fallback on and the browser header sent.
      await app.run(
        `store.set('ai', { provider: 'claude', url: '${fake.url}', model: 'claude-opus-5-5', key: 'sk-test', acceptedAt: 'x' });`,
      );
      await app.go('index.html?claude');
      const before = fake.seen.length;
      r = await app.run(
        `let last = ''; const t = await Mods.ai.complete(Mods.ai.config, 'sys', 'hi', (x) => (last = x)); return { t, last, head: $('#aiBtn').textContent.trim() };`,
      );
      assert.deepEqual(r, { t: 'Hello from Claude.', last: 'Hello from Claude.', head: 'AI · online' });
      const req = fake.seen.slice(before).find((s) => s.path.startsWith('/v1/messages'));
      // SDK 1.x sends the key as a bearer token
      assert.equal(req.headers.authorization, 'Bearer sk-test');
      assert.equal(req.headers['anthropic-dangerous-direct-browser-access'], 'true');
      assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
      assert.equal(req.body.fallbacks, 'default');
      assert.equal(req.body.model, 'claude-opus-5-5');

      // 6. Online: the app shows where the text goes and sends nothing when cancelled.
      const n = fake.seen.length;
      r = await app.run(`${wait}
      show('text'); Mods.text.setContent('hello world', 'a.txt');
      document.querySelector('[data-ai="text"]').click();
      await until(() => document.querySelector('.ai-input'));
      document.querySelector('.ai-input').value = 'Summarize'; click('Ask');
      await until(() => /Send to Claude/.test(document.body.innerText));
      const shown = [...document.querySelectorAll('.modal p')].map((p) => p.textContent).find((t) => /characters will be sent/.test(t));
      click('Cancel'); await sleep(300);
      return shown;`);
      assert.match(r, /characters will be sent to 127\.0\.0\.1:\d+, outside this device/);
      assert.equal(fake.seen.length, n, 'cancel must not send anything');

      // 7. Turning AI off deletes the key and hides every AI button.
      r = await app.run(`${wait}
      $$('.modal-bg').forEach((m) => m.remove());
      $('#aiBtn').click(); await until(() => document.querySelector('.modal'));
      click('Turn AI off');
      return { saved: store.get('ai'), head: $('#aiBtn').textContent.trim(), tools: $$('[data-ai]').filter((x) => !x.hidden).length };`);
      assert.deepEqual(r, { saved: null, head: 'Set up AI', tools: 0 });
    } finally {
      await app.close();
      fake.server.close();
    }
  },
);
