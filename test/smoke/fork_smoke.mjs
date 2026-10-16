// TEST smoke for the fork extensions (not run by CI).
// Env: RM_URL, RM_PASSWORD_FILE, RM_EDITOR_USER, RM_TARGET_USER, RM_ADMIN_USER,
//      RM_API_KEY_FILE (editor API key), RM_PROJECT, RM_LEGACY_ISSUES (comma ids),
//      RM_SHOTS (screenshot dir), RM_SSH_HOST + RM_CONTAINER (read-only rails runner).
// Run: NODE_PATH=<dir with playwright> node test/smoke/fork_smoke.mjs
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.join(process.env.NODE_PATH || process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback === undefined) { console.error('missing env ' + name); process.exit(2); }
    return fallback;
  }
  return v;
}

const BASE = env('RM_URL').replace(/\/$/, '');
const CONTAINER = env('RM_CONTAINER', '');
if (!/^https?:\/\/[^/]+:8889$/.test(BASE) || CONTAINER === 'redmine-prod' || (CONTAINER && CONTAINER !== 'redmine-test')) {
  console.error('refusing to run: RM_URL must be the TEST instance (:8889) and RM_CONTAINER, if set, must be redmine-test');
  process.exit(2);
}
const PW = fs.readFileSync(env('RM_PASSWORD_FILE'), 'utf8').trim();
const KEY = fs.readFileSync(env('RM_API_KEY_FILE'), 'utf8').trim();
const EDITOR = env('RM_EDITOR_USER');
const TARGET = env('RM_TARGET_USER');
const ADMIN = env('RM_ADMIN_USER');
const PROJECT = env('RM_PROJECT', 'smoke');
const LEGACY = env('RM_LEGACY_ISSUES', '').split(',').map(s => s.trim()).filter(Boolean);
const SHOTS = env('RM_SHOTS', path.resolve('smoke-shots'));
const SSH = env('RM_SSH_HOST', '');
fs.mkdirSync(SHOTS, { recursive: true });

const MENTIONED_IN = 'Zm\u00edn\u011bno v';
const INSERT_FILE = 'Vlo\u017eit soubor';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const results = [];
const facts = {};
const assert = (c, m) => { if (!c) throw new Error(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, url, body) {
  const r = await fetch(BASE + url, {
    method,
    headers: { 'X-Redmine-API-Key': KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  return { status: r.status, json: text && text.trim().startsWith('{') ? JSON.parse(text) : null };
}

async function issue(id, include) {
  const r = await api('GET', '/issues/' + id + '.json' + (include ? '?include=' + include : ''));
  assert(r.status === 200, 'GET issue ' + id + ' -> ' + r.status);
  return r.json.issue;
}

async function createIssue(subject) {
  const r = await api('POST', '/issues.json', { issue: { project_id: PROJECT, subject } });
  assert(r.status === 201, 'create issue -> ' + r.status);
  return r.json.issue.id;
}

class Unverified extends Error {}

function runner(code) {
  if (!SSH || !CONTAINER) throw new Unverified('no notification evidence: RM_SSH_HOST/RM_CONTAINER not set');
  let out;
  try {
    out = execFileSync('ssh', [SSH, 'docker exec -i ' + CONTAINER + " bash -lc 'cd /usr/src/redmine && bin/rails runner -e production -'"],
      { input: code, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    throw new Unverified('rails runner failed: ' + String(e.stderr || e.message).trim().split('\n').slice(-5).join(' | '));
  }
  const line = out.split('\n').find(l => l.startsWith('RESULT '));
  if (!line) throw new Unverified('rails runner returned no RESULT line: ' + out.trim().split('\n').slice(-3).join(' | '));
  return JSON.parse(line.slice(7));
}

function mentionEvidence(journalId) {
  return runner('j = Journal.find(' + Number(journalId) + '); User.current = j.user; j.send(:get_mentioned_users, nil, j.notes); ' +
    'puts %q(RESULT ) + {mentioned: j.mentioned_users.to_a.map(&:login), notified: j.notified_mentions.map(&:login)}.to_json');
}

async function shot(page, name) {
  const file = path.join(SHOTS, String(results.length + 1).padStart(2, '0') + '-' + name.replace(/\W+/g, '_') + '.png');
  try { await page.screenshot({ path: file, fullPage: true }); return file; } catch (e) { return null; }
}

async function check(page, name, fn) {
  const rec = { name, ok: true, status: 'PASS', info: '' };
  try { rec.info = (await fn()) || ''; } catch (e) {
    rec.ok = false;
    rec.status = e instanceof Unverified ? 'UNVERIFIED' : 'FAIL';
    rec.info = String(e.message || e);
  }
  rec.shot = await shot(page, name);
  results.push(rec);
  console.log(rec.status + ' ' + name + (rec.info ? ' :: ' + rec.info : ''));
}

async function login(page, user) {
  await page.goto(BASE + '/login');
  await page.evaluate(([u, pw]) => {
    document.getElementById('username').value = u;
    document.getElementById('password').value = pw;
  }, [user, PW]);
  await Promise.all([page.waitForNavigation(), page.evaluate(() => document.getElementById('username').form.submit())]);
  assert(!page.url().includes('/login'), 'login failed for ' + user);
}

async function notesEditable(page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.ck-editor__editable'))
    .some(el => el.ckeditorInstance && el.ckeditorInstance.sourceElement && el.ckeditorInstance.sourceElement.id === 'issue_notes'), null, { timeout: 15000 });
  const handle = await page.evaluateHandle(() => Array.from(document.querySelectorAll('.ck-editor__editable'))
    .find(el => el.ckeditorInstance.sourceElement.id === 'issue_notes'));
  return handle.asElement();
}

async function expandNotes(page) {
  const legend = page.locator('#add_notes legend[aria-expanded="false"]');
  if (await legend.count()) await legend.first().click();
}

async function openEdit(page, id) {
  await page.goto(BASE + '/issues/' + id + '/edit');
  const el = await notesEditable(page);
  await expandNotes(page);
  await el.scrollIntoViewIfNeeded();
  await el.click();
  return el;
}

async function editorData(el) {
  return el.evaluate(e => e.ckeditorInstance.getData());
}

async function submit(page) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }),
    page.locator('#issue-form input[type=submit][name=commit]').first().click()
  ]);
  await page.waitForLoadState('load');
}

async function pickMention(page, el, typed, needle) {
  await el.focus();
  await page.keyboard.type(typed, { delay: 80 });
  const item = page.locator('.ck-mentions .ck-list__item').filter({ hasText: needle }).first();
  await item.waitFor({ timeout: 10000 });
  await item.click();
  await sleep(200);
}

async function listedAttachments(page, filename) {
  const names = await page.locator('div.attachments a.icon-attachment').allTextContents();
  return names.filter(t => t.trim() === filename).length;
}

async function lastJournalId(id) {
  const j = (await issue(id, 'journals')).journals;
  return j.length ? Math.max(...j.map(x => x.id)) : null;
}

async function waitUploads(el, count, timeout = 20000) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    const ok = await el.evaluate((e, n) => {
      const html = e.ckeditorInstance.getData();
      const done = (html.match(/\/attachments\/download\/\d+/g) || []).length;
      return done >= n && !e.querySelector('.redmine-file-upload-pending, .ck-image-upload-complete-icon ~ .ck-upload-placeholder-loader, .ck-image-upload-placeholder');
    }, count);
    if (ok) return;
    await sleep(300);
  }
  throw new Error('uploads did not finish: ' + (await editorData(el)));
}

async function dispatchFiles(el, kind, specs) {
  await el.evaluate((e, [k, s]) => {
    const b64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    s.forEach(f => dt.items.add(new File([f.b64 ? b64(f.b64) : f.text], f.name, { type: f.type })));
    const r = e.getBoundingClientRect();
    const xy = { clientX: r.left + 20, clientY: r.top + 15, bubbles: true, cancelable: true };
    if (k === 'paste') {
      e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    } else {
      e.dispatchEvent(new DragEvent('dragenter', { ...xy, dataTransfer: dt }));
      e.dispatchEvent(new DragEvent('dragover', { ...xy, dataTransfer: dt }));
      e.dispatchEvent(new DragEvent('drop', { ...xy, dataTransfer: dt }));
    }
  }, [kind, specs]);
}

const PDF_TEXT = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 72 72]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

(async () => {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const src = await createIssue('fork smoke source ' + stamp);
  const tgt = await createIssue('fork smoke target ' + stamp);
  facts.source = src;
  facts.target = tgt;
  console.log('issues source=#' + src + ' target=#' + tgt);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e)));
  await login(page, EDITOR);

  let noteJournal = null;
  await check(page, '1 user mention @ dropdown selects target into editor', async () => {
    const el = await openEdit(page, src);
    await page.keyboard.type('Hi ', { delay: 30 });
    await pickMention(page, el, '@' + TARGET.slice(0, 2), '@' + TARGET);
    const data = await editorData(el);
    assert(data.includes('@' + TARGET), 'editor data lacks @' + TARGET + ': ' + data);
    facts.check1Data = data;
    return 'editor data ok';
  });

  await check(page, '2 issue mention # + saved a.user-mention + backref on target + mention notification', async () => {
    const el = await notesEditable(page);
    await el.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' see ', { delay: 30 });
    await pickMention(page, el, '#' + String(tgt), '#' + tgt);
    const data = await editorData(el);
    assert(data.includes('#' + tgt), 'editor data lacks #' + tgt + ': ' + data);
    await submit(page);
    noteJournal = await lastJournalId(src);
    facts.noteJournal = noteJournal;
    const link = page.locator('#change-' + noteJournal + ' a.user-mention');
    assert(await link.count() > 0, 'no a.user-mention in #change-' + noteJournal);
    const linkText = (await link.first().textContent()).trim();
    await page.goto(BASE + '/issues/' + tgt);
    const tj = (await issue(tgt, 'journals')).journals.filter(j => j.notes);
    assert(tj.length > 0, 'target has no notes');
    const last = tj.reduce((a, b) => (b.id > a.id ? b : a));
    assert(last.notes.includes(MENTIONED_IN), 'last target note lacks Zmineno v: ' + last.notes);
    assert(last.notes.includes('#change-' + noteJournal), 'backref lacks #change-' + noteJournal + ': ' + last.notes);
    const rendered = page.locator('#change-' + last.id + ' a[href*="#change-' + noteJournal + '"]');
    assert(await rendered.count() > 0, 'rendered backref link missing');
    facts.backrefJournal = last.id;
    facts.targetNoteCountAfterMention = tj.length;
    const ev = mentionEvidence(noteJournal);
    facts.noteMentions = ev;
    assert(ev.notified.includes(TARGET), 'source note does not notify ' + TARGET + ': ' + JSON.stringify(ev));
    return 'a.user-mention "' + linkText + '"; backref journal ' + last.id + '; notified_mentions=' + JSON.stringify(ev.notified);
  });

  await check(page, '3 quote: no new backref, no mention notification', async () => {
    assert(noteJournal, 'no source note from check 2');
    await page.goto(BASE + '/issues/' + src);
    await notesEditable(page).catch(() => null);
    const quote = page.locator('#change-' + noteJournal + ' a.icon-quote, #change-' + noteJournal + ' a.icon-comment').first();
    await quote.click();
    const el = await notesEditable(page);
    await expandNotes(page);
    await page.waitForFunction(() => {
      const e = Array.from(document.querySelectorAll('.ck-editor__editable')).find(x => x.ckeditorInstance.sourceElement.id === 'issue_notes');
      return e && /<blockquote/.test(e.ckeditorInstance.getData());
    }, null, { timeout: 10000 });
    const data = await editorData(el);
    assert(data.includes('#' + tgt) && data.includes('@' + TARGET), 'quote lacks mentions: ' + data);
    await submit(page);
    const qj = await lastJournalId(src);
    assert(qj && qj !== noteJournal, 'quote journal not created');
    facts.quoteJournal = qj;
    await sleep(1000);
    const tj = (await issue(tgt, 'journals')).journals.filter(j => j.notes);
    assert(tj.length === facts.targetNoteCountAfterMention, 'target note count changed ' + facts.targetNoteCountAfterMention + ' -> ' + tj.length);
    const ev = mentionEvidence(qj);
    facts.quoteMentions = ev;
    assert(ev.notified.length === 0, 'quote notifies mentions: ' + JSON.stringify(ev));
    return 'quote journal ' + qj + '; target notes stay ' + tj.length + '; quote notified_mentions=' + JSON.stringify(ev.notified);
  });

  await check(page, '4 paste PNG -> img + attachment', async () => {
    const before = (await issue(src, 'attachments')).attachments.length;
    const el = await openEdit(page, src);
    await dispatchFiles(el, 'paste', [{ name: 'smoke-paste.png', type: 'image/png', b64: PNG_B64 }]);
    await waitUploads(el, 1);
    assert((await el.$$('img[src*="/attachments/download/"]')).length > 0, 'no img in editable');
    await submit(page);
    const atts = (await issue(src, 'attachments')).attachments;
    assert(atts.length === before + 1, 'attachments ' + before + ' -> ' + atts.length);
    const name = atts[atts.length - 1].filename;
    assert(await listedAttachments(page, name) > 0, 'attachment ' + name + ' not in div.attachments');
    return 'attachment ' + name + ' listed';
  });

  await check(page, '5 drop PDF + PNG -> link + img, two attachments', async () => {
    const before = (await issue(src, 'attachments')).attachments.length;
    const el = await openEdit(page, src);
    await dispatchFiles(el, 'drop', [
      { name: 'smoke-drop.pdf', type: 'application/pdf', text: PDF_TEXT },
      { name: 'smoke-drop.png', type: 'image/png', b64: PNG_B64 }
    ]);
    await waitUploads(el, 2);
    const data = await editorData(el);
    assert(/<img[^>]+\/attachments\/download\//.test(data), 'no img: ' + data);
    assert(/<a[^>]+\/attachments\/download\/[^"]*smoke-drop\.pdf/.test(data), 'no pdf link: ' + data);
    await submit(page);
    const atts = (await issue(src, 'attachments')).attachments;
    assert(atts.length === before + 2, 'attachments ' + before + ' -> ' + atts.length);
    for (const name of ['smoke-drop.pdf', 'smoke-drop.png']) {
      assert(await listedAttachments(page, name) > 0, 'attachment ' + name + ' not in div.attachments');
    }
    return 'attachments ' + before + ' -> ' + atts.length + '; both listed';
  });

  await check(page, '6 paperclip button with Czech tooltip', async () => {
    const el = await openEdit(page, src);
    const btn = await el.evaluate((e, label) => {
      const root = e.ckeditorInstance.ui.element;
      const b = Array.from(root.querySelectorAll('.ck-toolbar .ck-button')).find(x =>
        (x.getAttribute('data-cke-tooltip-text') || '') === label || (x.querySelector('.ck-button__label')?.textContent || '') === label);
      return b ? { tip: b.getAttribute('data-cke-tooltip-text'), label: b.querySelector('.ck-button__label')?.textContent, svg: !!b.querySelector('svg') } : null;
    }, INSERT_FILE);
    assert(btn, 'no toolbar button labelled Vlozit soubor');
    const btnLoc = page.locator('.ck-toolbar .ck-button[data-cke-tooltip-text="' + INSERT_FILE + '"]').first();
    await btnLoc.hover();
    await sleep(800);
    return 'tooltip=' + JSON.stringify(btn.tip) + ' icon=' + btn.svg;
  });

  await page.goto(BASE + '/logout').catch(() => {});
  await ctx.clearCookies();
  if (LEGACY.length) {
    await login(page, ADMIN);
    for (const id of LEGACY) {
      await check(page, '7 legacy issue #' + id + ' renders, /system/rich/ image 200', async () => {
        const resp = await page.goto(BASE + '/issues/' + id);
        assert(resp.status() === 200, 'issue page ' + resp.status());
        await page.waitForLoadState('networkidle');
        const srcs = await page.$$eval('img[src*="/system/rich/"]', a => a.map(i => ({ src: i.src, ok: i.complete && i.naturalWidth > 0 })));
        assert(srcs.length > 0, 'no /system/rich/ img on page');
        const bad = srcs.filter(s => !s.ok);
        for (const s of srcs) {
          const r = await page.request.get(s.src);
          if (r.status() !== 200) bad.push({ src: s.src, status: r.status() });
        }
        assert(bad.length === 0, 'broken images: ' + JSON.stringify(bad));
        const mentions = await page.locator('[class*="user-mention-link-"], a.user-mention').count();
        return srcs.length + ' rich images loaded (200); mention links on page=' + mentions;
      });
    }
  }

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log('FACTS ' + JSON.stringify(facts));
  if (consoleErrors.length) console.log('PAGE ERRORS ' + JSON.stringify(consoleErrors.slice(0, 10)));
  const unverified = results.filter(r => r.status === 'UNVERIFIED').length;
  console.log((failed ? 'NOT PASSED ' : 'ALL PASS ') + (results.length - failed) + '/' + results.length +
    (failed ? ' (FAIL ' + (failed - unverified) + ', UNVERIFIED ' + unverified + ')' : ''));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(3); });
