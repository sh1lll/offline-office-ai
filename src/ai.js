'use strict';
/* ============================== AI (opt-in) ============================== */
// Off until the user finishes setup. A model on this computer (Ollama, LM Studio) keeps everything
// on the device; an online service only after a risk step the user has to tick through, and every
// request to it shows where the text is going before it is sent.
Mods.ai = (() => {
  const KEY = 'ai';
  // kind 'local' = must be a localhost URL; 'online' = text leaves the device
  const PROVIDERS = {
    ollama: { name: 'Ollama', kind: 'local', api: 'openai', url: 'http://localhost:11434/v1' },
    lmstudio: { name: 'LM Studio', kind: 'local', api: 'openai', url: 'http://localhost:1234/v1' },
    localOther: {
      name: 'Other local server',
      kind: 'local',
      api: 'openai',
      url: 'http://localhost:8080/v1',
      editUrl: true,
    },
    claude: {
      name: 'Claude (Anthropic)',
      company: 'Anthropic',
      kind: 'online',
      api: 'anthropic',
      url: 'https://api.anthropic.com',
      model: 'claude-opus-5-5',
      key: true,
    },
    openai: {
      name: 'OpenAI',
      company: 'OpenAI',
      kind: 'online',
      api: 'openai',
      url: 'https://api.openai.com/v1',
      key: true,
    },
    gemini: {
      name: 'Google Gemini',
      company: 'Google',
      kind: 'online',
      api: 'openai',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai',
      key: true,
    },
    openrouter: {
      name: 'OpenRouter',
      company: 'OpenRouter',
      kind: 'online',
      api: 'openai',
      url: 'https://openrouter.ai/api/v1',
      key: true,
    },
    onlineOther: {
      name: 'Other online service',
      company: 'that service',
      kind: 'online',
      api: 'openai',
      url: '',
      key: true,
      editUrl: true,
    },
  };
  const isLocalUrl = (u) => {
    try {
      return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname);
    } catch {
      return false;
    }
  };
  const hostOf = (u) => {
    try {
      return new URL(u).host;
    } catch {
      return u;
    }
  };
  let cfg = store.get(KEY); // { provider, url, model, key, acceptedAt }
  if (cfg && !PROVIDERS[cfg.provider]) cfg = null;
  let askEachTime = true; // for online services; can be turned off until the tab closes

  /* --- talking to models --- */
  let claudeClient = null;
  async function claude() {
    if (claudeClient) return claudeClient;
    await Formats.loadScript('vendor/anthropic-sdk.min.js');
    // The key is the user's own, typed into their own browser; nothing else sees it.
    claudeClient = new window.Anthropic({
      apiKey: cfg.key,
      baseURL: cfg.url,
      dangerouslyAllowBrowser: true,
    });
    return claudeClient;
  }
  // Models that support server-side fallback when a safety classifier declines.
  const FALLBACK_MODELS = [
    'claude-fable-5-2',
    'claude-fable-5-1',
    'claude-opus-5-5',
    'claude-opus-5',
    'claude-sonnet-5-5',
  ];
  // Streams a reply; onText gets the text so far. Returns the full text.
  async function complete(c, system, user, onText) {
    const p = PROVIDERS[c.provider];
    if (p.api === 'anthropic') {
      const A = window.Anthropic;
      try {
        const client = await claude();
        const params = {
          model: c.model,
          max_tokens: 16000,
          system,
          messages: [{ role: 'user', content: user }],
        };
        let stream;
        if (FALLBACK_MODELS.includes(c.model))
          stream = client.beta.messages.stream({
            ...params,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          });
        else stream = client.messages.stream(params);
        let text = '';
        stream.on('text', (d) => onText?.((text += d)));
        const msg = await stream.finalMessage();
        if (msg.stop_reason === 'refusal') throw new Error('The model declined this request.');
        return msg.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('');
      } catch (e) {
        if (A && e instanceof A.AuthenticationError) throw new Error('The API key was not accepted.');
        if (A && e instanceof A.NotFoundError) throw new Error(`The model "${c.model}" was not found.`);
        if (A && e instanceof A.RateLimitError)
          throw new Error('Too many requests. Wait a moment and try again.');
        if (A && e instanceof A.APIConnectionError) throw new Error(`Could not reach ${hostOf(c.url)}.`);
        throw e;
      }
    }
    // OpenAI-compatible chat completions: OpenAI, Gemini, OpenRouter, Ollama, LM Studio, others
    let r;
    try {
      r = await fetch(c.url.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(c.key ? { Authorization: 'Bearer ' + c.key } : {}),
        },
        body: JSON.stringify({
          model: c.model,
          stream: true,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
    } catch {
      throw new Error(
        `Could not reach ${hostOf(c.url)}.` +
          (p.kind === 'local'
            ? ' Is it running, and does it allow requests from this page? See the setup tips.'
            : ''),
      );
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      let why = '';
      try {
        why = JSON.parse(body).error?.message || '';
      } catch {}
      if (r.status === 401 || r.status === 403)
        throw new Error('The API key was not accepted.' + (why ? ' ' + why : ''));
      if (r.status === 404)
        throw new Error(`Not found. Check the address and the model name.${why ? ' ' + why : ''}`);
      throw new Error(`The service answered ${r.status}.${why ? ' ' + why : ''}`);
    }
    // Server-sent events: lines of "data: {...}", ending with "data: [DONE]"
    const reader = r.body.getReader(),
      dec = new TextDecoder();
    let buf = '',
      text = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) {
        const m = /^data:\s*(.*)$/.exec(l.trim());
        if (!m || m[1] === '[DONE]') continue;
        try {
          const d = JSON.parse(m[1]).choices?.[0]?.delta?.content;
          if (d) onText?.((text += d));
        } catch {}
      }
    }
    return text;
  }
  async function listModels(c) {
    const p = PROVIDERS[c.provider];
    if (p.api === 'anthropic') {
      const client = await claude();
      const out = [];
      for await (const m of client.models.list()) out.push(m.id);
      return out;
    }
    const r = await fetch(c.url.replace(/\/$/, '') + '/models', {
      headers: c.key ? { Authorization: 'Bearer ' + c.key } : {},
    });
    if (!r.ok) throw new Error(`The service answered ${r.status}.`);
    const j = await r.json();
    return (j.data || []).map((m) => m.id).sort();
  }

  /* --- dialogs --- */
  function dialog(title, ...kids) {
    const bg = el('div', { class: 'modal-bg' });
    const box = el(
      'div',
      { class: 'modal wide ai-modal', role: 'dialog', 'aria-label': title },
      el('h3', {}, title),
      ...kids,
    );
    bg.append(box);
    document.body.append(bg);
    return { bg, box, close: () => bg.remove() };
  }
  const acts = (...b) => el('div', { class: 'acts' }, ...b);
  const btn = (label, onclick, cls = 'btn') => el('button', { class: cls, type: 'button', onclick }, label);

  // Setup: choose where it runs -> (online) risk step -> connect -> test -> done.
  function setup() {
    const d = dialog('Set up AI');
    const draft = { provider: null, url: '', model: '', key: '' };
    const body = el('div', { class: 'ai-step' });
    d.box.append(body);
    const step = (n, total, ...kids) => {
      body.replaceChildren(el('p', { class: 'ai-count' }, `Step ${n} of ${total}`), ...kids);
      d.box.querySelector('button, input')?.focus();
    };
    const total = () => (draft.provider && PROVIDERS[draft.provider].kind === 'online' ? 4 : 3);

    function choose() {
      const opt = (id) => {
        const p = PROVIDERS[id];
        return el(
          'label',
          { class: 'ai-opt' },
          el('input', { type: 'radio', name: 'aiProv', value: id, checked: draft.provider === id }),
          el('span', {}, p.name),
        );
      };
      const next = btn(
        'Continue',
        () => {
          const v = $('input[name="aiProv"]:checked', body)?.value;
          if (!v) return;
          draft.provider = v;
          draft.url = PROVIDERS[v].url;
          draft.model = PROVIDERS[v].model || '';
          PROVIDERS[v].kind === 'online' ? risk() : localInfo();
        },
        'btn primary',
      );
      step(
        1,
        total(),
        el('b', {}, 'Where should AI run?'),
        el('p', {}, 'AI is off until you finish these steps. You can turn it off again at any time.'),
        el(
          'div',
          { class: 'ai-group' },
          el('span', { class: 'ai-tag local' }, 'On this computer. Nothing leaves your device.'),
          opt('ollama'),
          opt('lmstudio'),
          opt('localOther'),
        ),
        el(
          'div',
          { class: 'ai-group' },
          el('span', { class: 'ai-tag online' }, 'Online service. Text you send leaves your device.'),
          opt('claude'),
          opt('openai'),
          opt('gemini'),
          opt('openrouter'),
          opt('onlineOther'),
        ),
        acts(btn('Cancel', d.close), next),
      );
    }
    function localInfo() {
      const p = PROVIDERS[draft.provider];
      step(
        2,
        3,
        el('b', {}, `${p.name} on this computer`),
        el('p', {}, 'The model runs on your own machine. Text you send to it stays on this device.'),
        el(
          'div',
          { class: 'ai-tips' },
          el('b', {}, 'If the connection test fails'),
          el(
            'p',
            {},
            'Make sure the app is running and a model is downloaded. Local servers only answer pages they trust:',
          ),
          el(
            'p',
            {},
            'Ollama: quit it, then start it with OLLAMA_ORIGINS set to "*" (in a terminal: OLLAMA_ORIGINS="*" ollama serve).',
          ),
          el('p', {}, 'LM Studio: open the Developer tab and turn on "Enable CORS".'),
        ),
        acts(btn('Back', choose), btn('Continue', connect, 'btn primary')),
      );
    }
    function risk() {
      const p = PROVIDERS[draft.provider];
      const who = p.company;
      const check = el('input', { type: 'checkbox', id: 'aiAccept' });
      const next = btn('Continue', connect, 'btn primary');
      next.disabled = true;
      check.onchange = () => (next.disabled = !check.checked);
      step(
        2,
        4,
        el('b', { class: 'ai-warn-h' }, 'This sends your text off this device'),
        el(
          'ul',
          { class: 'ai-risks' },
          el(
            'li',
            {},
            `Text you choose to send goes over the internet to ${who === 'that service' ? "that service's" : who + "'s"} servers. Everything else in the app still stays on your device.`,
          ),
          el(
            'li',
            {},
            `${who[0].toUpperCase() + who.slice(1)} may store it and handles it under its own privacy policy and terms, not this app's.`,
          ),
          el('li', {}, `Requests may be billed to your account with ${who}.`),
          el(
            'li',
            {},
            'Your API key is saved in this browser. Anyone who uses this browser profile can use it. Turning AI off deletes it.',
          ),
          el(
            'li',
            {},
            "Don't send anything you would not paste into a website: passwords, ID numbers, medical or legal documents you were asked to keep private.",
          ),
        ),
        el(
          'label',
          { class: 'check ai-accept', for: 'aiAccept' },
          check,
          ` I understand that text I send will leave this device and go to ${who}.`,
        ),
        acts(btn('Back', choose), next),
      );
    }
    function connect() {
      const p = PROVIDERS[draft.provider];
      const n = p.kind === 'online' ? 3 : 2;
      const url = el('input', {
        class: 'ctl',
        value: draft.url,
        placeholder: 'https://example.com/v1',
        spellcheck: false,
      });
      const key = el('input', {
        class: 'ctl',
        type: 'password',
        value: draft.key,
        autocomplete: 'off',
        placeholder: 'Paste your API key',
      });
      const model = el('input', {
        class: 'ctl',
        value: draft.model,
        placeholder: 'Model name',
        spellcheck: false,
        list: 'aiModels',
      });
      const models = el('datalist', { id: 'aiModels' });
      const msg = el('p', { class: 'ai-msg' });
      const read = () => {
        draft.url = url.value.trim();
        draft.key = key.value.trim();
        draft.model = model.value.trim();
      };
      const check = () => {
        read();
        if (p.editUrl && !/^https?:\/\//.test(draft.url))
          return 'Enter the service address, starting with http:// or https://.';
        if (p.kind === 'local' && !isLocalUrl(draft.url))
          return 'A local server must be on this computer (localhost or 127.0.0.1). For anything else, choose "Other online service".';
        if (p.kind === 'online' && isLocalUrl(draft.url))
          return 'This address is on this computer. Choose "Other local server" instead.';
        if (p.key && !draft.key) return 'Paste your API key.';
        return '';
      };
      const load = btn(
        'Load models',
        async () => {
          const err = check();
          if (err) return (msg.textContent = err);
          msg.textContent = 'Loading models…';
          claudeClient = null;
          cfg = { ...draft };
          try {
            const list = await listModels(draft);
            models.replaceChildren(...list.map((id) => el('option', { value: id })));
            msg.textContent = list.length
              ? `${list.length} models found. Pick one in the model box.`
              : 'No models found.';
            if (!draft.model && list.length) model.value = list[0];
          } catch (e) {
            msg.textContent = 'Could not load models: ' + e.message;
          } finally {
            cfg = store.get(KEY);
            claudeClient = null;
          }
        },
        'btn ghost',
      );
      step(
        n,
        n + 1,
        el('b', {}, `Connect to ${p.name}`),
        p.editUrl ? el('div', { class: 'field' }, el('label', { class: 'lbl' }, 'Address'), url) : '',
        p.key ? el('div', { class: 'field' }, el('label', { class: 'lbl' }, 'API key'), key) : '',
        el(
          'div',
          { class: 'field' },
          el('label', { class: 'lbl' }, 'Model'),
          el('div', { class: 'row' }, model, load),
          models,
        ),
        msg,
        acts(
          btn('Back', p.kind === 'online' ? risk : localInfo),
          btn(
            'Continue',
            () => {
              const err = check() || (!draft.model && 'Enter a model name, or use Load models.');
              if (err) return (msg.textContent = err);
              test();
            },
            'btn primary',
          ),
        ),
      );
    }
    function test() {
      const p = PROVIDERS[draft.provider];
      const n = p.kind === 'online' ? 4 : 3;
      const out = el('p', { class: 'ai-msg' }, 'Sends one short test message: "Reply with the word OK."');
      const finish = btn(
        'Turn on AI',
        () => {
          cfg = { ...draft, acceptedAt: p.kind === 'online' ? new Date().toISOString() : null };
          store.set(KEY, cfg);
          claudeClient = null;
          d.close();
          refresh();
          UI.toast(`AI is on: ${p.name}`);
        },
        'btn primary',
      );
      finish.disabled = true;
      const run = btn('Run the test', async () => {
        run.disabled = true;
        out.textContent = 'Testing…';
        const prev = cfg;
        cfg = { ...draft };
        claudeClient = null;
        try {
          const t = await complete(draft, 'You are a connection test.', 'Reply with the word OK.', null);
          out.textContent = `It works. The model replied: "${t.trim().slice(0, 80)}"`;
          finish.disabled = false;
        } catch (e) {
          out.textContent = 'The test failed: ' + e.message;
        } finally {
          cfg = prev;
          claudeClient = null;
          run.disabled = false;
        }
      });
      step(n, n, el('b', {}, 'Test the connection'), out, acts(btn('Back', connect), run, finish));
    }
    choose();
  }

  // Status of a working setup, with the off switch.
  function status() {
    const p = PROVIDERS[cfg.provider];
    const d = dialog('AI');
    d.box.append(
      el(
        'div',
        { class: 'ai-step' },
        el('p', {}, el('b', {}, p.name), ` · ${cfg.model}`),
        el(
          'p',
          { class: 'ai-tag ' + p.kind },
          p.kind === 'local'
            ? 'Runs on this computer. Nothing leaves your device.'
            : `Online. Text you send goes to ${hostOf(cfg.url)}.`,
        ),
        p.kind === 'online'
          ? el(
              'label',
              { class: 'check' },
              el('input', {
                type: 'checkbox',
                checked: askEachTime,
                onchange: (e) => (askEachTime = e.target.checked),
              }),
              ' Show what will be sent and ask before each request',
            )
          : '',
        acts(
          btn(
            'Turn AI off',
            () => {
              store.set(KEY, null);
              cfg = null;
              claudeClient = null;
              askEachTime = true;
              d.close();
              refresh();
              UI.toast('AI is off. The saved key was deleted.');
            },
            'btn danger',
          ),
          btn('Change', () => (d.close(), setup())),
          btn('Close', d.close, 'btn primary'),
        ),
      ),
    );
  }

  // Before an online request: where it goes and how much. Resolves true to send.
  function confirmSend(chars) {
    const p = PROVIDERS[cfg.provider];
    if (p.kind === 'local' || !askEachTime) return Promise.resolve(true);
    return new Promise((res) => {
      const stop = el('input', { type: 'checkbox' });
      const d = dialog(
        'Send to ' + p.name.replace(/ \(.*\)$/, '') + '?',
        el(
          'p',
          {},
          `${chars.toLocaleString()} characters will be sent to ${hostOf(cfg.url)}, outside this device.`,
        ),
        el('label', { class: 'check' }, stop, " Don't ask again until I close this tab"),
        acts(
          btn('Cancel', () => (d.close(), res(false))),
          btn(
            'Send',
            () => {
              if (stop.checked) askEachTime = false;
              d.close();
              res(true);
            },
            'btn primary',
          ),
        ),
      );
    });
  }

  // The shared assistant panel: an instruction, a streamed answer, and what to do with it.
  // ctx: { title, text, system, chips, apply: [[label, fn(answer)]] }
  const MAX = 150000;
  function assist(ctx) {
    const input = el('textarea', { class: 'ctl ai-input', rows: 2, placeholder: 'What should AI do?' });
    const out = el('div', { class: 'ai-out', 'aria-live': 'polite' });
    const applyRow = el('div', { class: 'acts' });
    const go = btn('Ask', () => run(), 'btn primary');
    const d = dialog(
      ctx.title,
      el(
        'div',
        { class: 'ai-chips' },
        ...ctx.chips.map((c) => btn(c, () => ((input.value = c), run()), 'btn ghost ai-chip')),
      ),
      input,
      el(
        'div',
        { class: 'acts' },
        el('span', { class: 'ai-where' }, whereLabel()),
        btn('Close', () => d.close()),
        go,
      ),
      out,
      applyRow,
    );
    input.focus();
    input.onkeydown = (e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && run();
    let text = ctx.text;
    if (text.length > MAX) text = text.slice(0, MAX);
    async function run() {
      const ask = input.value.trim();
      if (!ask) return input.focus();
      const user = `${ask}\n\n<content>\n${text}\n</content>`;
      if (!(await confirmSend(user.length + ctx.system.length))) return;
      go.disabled = true;
      applyRow.replaceChildren();
      out.textContent = 'Working…';
      try {
        const answer = await complete(cfg, ctx.system, user, (t) => (out.textContent = t));
        out.textContent = answer;
        applyRow.replaceChildren(
          ...(ctx.text.length > MAX
            ? [el('span', { class: 'ai-where' }, 'Only the first 150,000 characters were sent.')]
            : []),
          btn('Copy', () => navigator.clipboard.writeText(answer).then(() => UI.toast('Copied'))),
          ...ctx.apply.map(([label, fn]) => btn(label, () => (fn(answer), d.close()), 'btn primary')),
        );
      } catch (e) {
        out.textContent = '';
        out.append(el('p', { class: 'ai-err' }, e.message));
      } finally {
        go.disabled = false;
      }
    }
  }
  const whereLabel = () => {
    const p = PROVIDERS[cfg.provider];
    return p.kind === 'local'
      ? `${p.name} · on this computer`
      : `${p.name.replace(/ \(.*\)$/, '')} · sends to ${hostOf(cfg.url)}`;
  };
  const PLAIN = 'Reply with the result only: no preamble, no explanation, no Markdown code fences.';

  /* --- per editor --- */
  function docAI() {
    const page = $('#docPage');
    const sel = getSelection();
    const range =
      sel.rangeCount && page.contains(sel.getRangeAt(0).commonAncestorContainer)
        ? sel.getRangeAt(0).cloneRange()
        : null;
    const picked = range && !range.collapsed ? range.toString() : '';
    const insertText = (answer, r) => {
      const frag = document.createDocumentFragment();
      answer
        .trim()
        .split(/\n{2,}/)
        .forEach((para) => frag.append(el('p', {}, para.replace(/\n/g, ' '))));
      r.deleteContents();
      r.insertNode(frag);
      page.dispatchEvent(new Event('input', { bubbles: true }));
    };
    assist({
      title: picked ? 'AI · selected text' : 'AI · this document',
      text: picked || page.innerText,
      system: picked
        ? 'You edit a passage from a document. Follow the instruction and return the rewritten passage. ' +
          PLAIN
        : 'You help with a document. Follow the instruction about the document. ' + PLAIN,
      chips: picked
        ? ['Fix spelling and grammar', 'Make it shorter', 'Make it clearer', 'Make it more formal']
        : [
            'Summarize in five bullet points',
            'Suggest a title',
            'List the action items',
            'Find unclear sentences',
          ],
      apply: picked
        ? [['Replace selection', (a) => insertText(a, range)]]
        : [
            [
              'Add to the end',
              (a) => {
                const r = document.createRange();
                r.selectNodeContents(page);
                r.collapse(false);
                insertText(a, r);
              },
            ],
          ],
    });
  }
  function textAI() {
    const ta = $('#txArea');
    const [s, e] = [ta.selectionStart, ta.selectionEnd];
    const picked = ta.value.slice(s, e);
    const put = (a, from, to) => {
      ta.setRangeText(a, from, to, 'select');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };
    assist({
      title: picked ? 'AI · selected text' : 'AI · this file',
      text: picked || ta.value,
      system:
        (picked
          ? 'You edit a selected part of a text or code file. Return the replacement. '
          : 'You help with a text or code file. ') + PLAIN,
      chips: picked
        ? ['Fix mistakes', 'Explain this', 'Make it shorter', 'Convert to a Markdown table']
        : [
            'Summarize this file',
            'Find mistakes',
            'Explain this code',
            'Write a short README section about it',
          ],
      apply: picked
        ? [['Replace selection', (a) => put(a, s, e)]]
        : [['Add to the end', (a) => put('\n' + a, ta.value.length, ta.value.length)]],
    });
  }
  function sheetAI() {
    // Column headers from the first row as shown, so the model knows what each column holds.
    const head = $$('#mod-sheet table.grid tbody tr')[0];
    const cols = head
      ? $$('td', head)
          .map((td, i) => `${String.fromCharCode(65 + i)}: ${td.textContent.trim()}`)
          .filter((x) => !/: $/.test(x))
      : [];
    const ref = $('#shRef').value;
    assist({
      title: 'AI · formula for ' + ref,
      text: `Current cell: ${ref}\nRow 1 headers: ${cols.join(', ') || '(none)'}`,
      system:
        'You write one spreadsheet formula for the described task, using common Excel functions (SUM, IF, VLOOKUP, XLOOKUP, SUMIF, COUNTIF, AVERAGE, ROUND, INDEX, MATCH and similar). Reply with only the formula, starting with =.',
      chips: ['Total of column B', 'Average of the numbers above', 'Count rows where column B is over 10'],
      apply: [
        [
          'Put in formula bar',
          (a) => {
            const f = $('#shFormula');
            f.value = (a.match(/=[^\n`]+/) || [a.trim()])[0];
            f.focus();
            UI.toast('Press Enter to put the formula in ' + ref);
          },
        ],
      ],
    });
  }
  async function pdfAI() {
    if (!Mods.pdf.hasDoc()) return UI.toast('Open a PDF first.', true);
    const parts = await Mods.pdf.text();
    const text = parts.map((s, i) => `[Page ${i + 1}]\n${s}`).join('\n\n');
    if (!parts.join('').trim())
      return UI.toast('This PDF has no text yet. Use Recognize text (OCR) first.', true);
    assist({
      title: 'AI · ask about this PDF',
      text,
      system:
        'You answer questions about a PDF. Use only what the document says, and name the page numbers you used. ' +
        PLAIN,
      chips: [
        'Summarize this PDF',
        'What are the key dates and amounts?',
        'What does this commit me to?',
        'List anything unusual',
      ],
      apply: [['Open in Text editor', (a) => Mods.text.setContent(a + '\n', 'pdf-answer.txt')]],
    });
  }
  const EDITORS = { doc: docAI, text: textAI, sheet: sheetAI, pdf: pdfAI };

  /* --- header button and editor buttons --- */
  function refresh() {
    const b = $('#aiBtn');
    const p = cfg && PROVIDERS[cfg.provider];
    b.classList.toggle('on', !!p);
    b.dataset.kind = p ? p.kind : '';
    b.lastChild.textContent = p ? (p.kind === 'local' ? 'AI · local' : 'AI · online') : 'Set up AI';
    b.title = p
      ? `${p.name}, ${cfg.model}. Click for settings or to turn it off.`
      : 'AI is off. Click to set it up.';
    $$('[data-ai]').forEach((x) => (x.hidden = !p));
  }
  $('#aiBtn').onclick = () => (cfg ? status() : setup());
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ai]');
    if (b && cfg) EDITORS[b.dataset.ai]();
  });
  refresh();
  return {
    complete,
    providers: PROVIDERS,
    get config() {
      return cfg;
    },
  };
})();
