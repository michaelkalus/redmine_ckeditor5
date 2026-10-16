import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionFiles, clipboardAction, RedmineFileUpload } from '../../frontend/redmine_file_upload.mjs';

const png = { name: 'a.png', type: 'image/png' };
const svg = { name: 'b.svg', type: 'image/svg+xml' };
const pdf = { name: 'doc.pdf', type: 'application/pdf' };

test('partitionFiles separates raster images from documents', () => {
  assert.deepEqual(partitionFiles([png, pdf, svg]), { images: [png], documents: [pdf, svg] });
});

test('clipboardAction only handles transfers with documents and no html', () => {
  assert.equal(clipboardAction({ files: [], html: '' }), 'pass');
  assert.equal(clipboardAction({ files: [png], html: '' }), 'pass');
  assert.equal(clipboardAction({ files: [pdf], html: '' }), 'handle');
  assert.equal(clipboardAction({ files: [png, pdf], html: '' }), 'handle');
  assert.equal(clipboardAction({ files: [pdf], html: '<p>x</p>' }), 'pass');
});

function fakeEditor({ result, error, status = 'idle', config = {}, form = true, schema = {}, uploadImage = true, readOnly = false, pending = false, markerRoot } = {}) {
  const markers = new Map();
  const listeners = new Map();
  const calls = { inserted: [], alerts: [], destroyed: [], executed: [], kinds: [], selection: [], log: [], paragraphs: [], aborted: [] };
  const key = at => (at && typeof at === 'object' ? at.at : at);
  const position = at => ({ at, ...(markerRoot ? { root: markerRoot } : {}), getShiftedBy: n => ({ at, shift: n }) });
  const writer = {
    createRange: at => ({ at }),
    addMarker: (name, { range }) => {
      calls.log.push('marker');
      markers.set(name, { getStart: () => position(key(range.at)) });
    },
    removeMarker: name => markers.delete(name),
    insertText: (...args) => calls.inserted.push(args),
    setSelection: at => calls.selection.push(at),
    createElement: name => ({ name }),
    insert: (element, at) => calls.paragraphs.push([element.name, key(at)]),
    createPositionAfter: element => `after:${element}`,
    createPositionAt: element => position(`in:${element.name}`)
  };
  const check = (rule, at) => (typeof rule === 'function' ? rule(key(at)) : rule !== false);
  const editor = {
    state: 'ready',
    isReadOnly: readOnly,
    on: (name, callback) => listeners.set(name, callback),
    fire: name => listeners.get(name)?.(),
    conversion: { for: () => ({ markerToElement: () => {} }) },
    config: { get: key => ({ 'redmineUpload.fileUploadUrl': '/u?kind=file', ...config })[key] },
    sourceElement: { closest: () => (form ? { querySelector: () => ({}) } : null) },
    commands: { get: name => (name === 'uploadImage' ? { isEnabled: uploadImage } : null) },
    execute: (name, args) => {
      calls.log.push('execute');
      calls.executed.push([name, args]);
    },
    model: {
      markers: { get: name => markers.get(name), has: name => markers.has(name) },
      document: { selection: { getFirstPosition: () => 'SEL', getSelectedElement: () => schema.selected || null } },
      schema: {
        checkChild: (at, child) => check(child === '$text' ? schema.text : schema.paragraph, at),
        checkAttribute: () => schema.link !== false,
        createContext: () => ({ push: () => ({}) }),
        getNearestSelectionRange: () => (schema.nearest ? { start: schema.nearest } : null)
      },
      change: cb => cb(writer)
    },
    plugins: {
      get: () => ({
        createLoader: file => {
          calls.kinds.push(editor._redmineUploadKind);
          const loader = { file, status };
          let reject;
          loader.upload = () => {
            if (pending) return new Promise((_resolve, rejecter) => { reject = rejecter; });
            return error ? Promise.reject(error) : Promise.resolve(result);
          };
          loader.abort = () => {
            loader.status = 'aborted';
            calls.aborted.push(loader);
            reject?.(new Error('aborted'));
          };
          return loader;
        },
        destroyLoader: loader => calls.destroyed.push(loader)
      })
    }
  };
  global.window = { alert: message => calls.alerts.push(message) };
  RedmineFileUpload(editor);
  return { editor, markers, calls };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('document upload inserts a link at the marker and cleans up', async () => {
  const { editor, markers, calls } = fakeEditor({ result: { default: '/attachments/download/5/doc.pdf', filename: 'doc.pdf', id: 5 } });
  editor._redmineFileUpload.uploadFiles([pdf]);
  assert.equal(markers.size, 1);
  await flush();
  assert.deepEqual(calls.kinds, ['file']);
  assert.equal(editor._redmineUploadKind, undefined);
  assert.deepEqual(calls.inserted[0], ['doc.pdf', { linkHref: '/attachments/download/5/doc.pdf' }, { at: 'SEL', getShiftedBy: calls.inserted[0][2].getShiftedBy }]);
  assert.equal(calls.inserted[1][0], ' ');
  assert.equal(markers.size, 0);
  assert.equal(calls.destroyed.length, 1);
});

test('failed upload removes the marker and alerts', async () => {
  const { editor, markers, calls } = fakeEditor({ error: new Error('Too big') });
  editor._redmineFileUpload.uploadFiles([pdf]);
  await flush();
  assert.deepEqual(calls.alerts, ['Too big']);
  assert.equal(markers.size, 0);
  assert.equal(calls.inserted.length, 0);
  assert.equal(calls.destroyed.length, 1);
});

test('aborted upload does not alert', async () => {
  const { editor, calls } = fakeEditor({ error: new Error('abort'), status: 'aborted' });
  editor._redmineFileUpload.uploadFiles([pdf]);
  await flush();
  assert.deepEqual(calls.alerts, []);
});

test('mixed drop sends images to uploadImage and documents to loaders', async () => {
  const { editor, calls } = fakeEditor({ result: { default: '/x', filename: 'doc.pdf' } });
  editor._redmineFileUpload.uploadFiles([png, pdf], 'DROP');
  await flush();
  assert.deepEqual(calls.selection, ['DROP']);
  assert.deepEqual(calls.executed, [['uploadImage', { file: [png] }]]);
  assert.deepEqual(calls.kinds, ['file']);
});

test('nothing happens without fileUploadUrl or attachments form', () => {
  const noUrl = fakeEditor({ config: { 'redmineUpload.fileUploadUrl': undefined } });
  noUrl.editor._redmineFileUpload.uploadFiles([pdf]);
  const noForm = fakeEditor({ form: false });
  noForm.editor._redmineFileUpload.uploadFiles([pdf]);
  assert.deepEqual(noUrl.calls.kinds, []);
  assert.deepEqual(noForm.calls.kinds, []);
});

const done = { default: '/attachments/download/5/doc.pdf', filename: 'doc.pdf', id: 5 };

test('mixed drop creates document markers before uploadImage runs', async () => {
  const { editor, calls } = fakeEditor({ result: done });
  editor._redmineFileUpload.uploadFiles([png, pdf], 'DROP');
  assert.deepEqual(calls.log, ['marker', 'execute']);
  await flush();
});

test('position without text falls back to the nearest text range', async () => {
  const { editor, calls } = fakeEditor({ result: done, schema: { text: at => at !== 'SEL', nearest: 'NEAR' } });
  editor._redmineFileUpload.uploadFiles([pdf]);
  await flush();
  assert.equal(calls.inserted[0][2].at, 'NEAR');
  assert.deepEqual(calls.paragraphs, []);
});

test('selected widget gets a new paragraph after it for the link', async () => {
  const { editor, calls } = fakeEditor({ result: done, schema: { text: at => at.startsWith('in:'), selected: 'IMG' } });
  editor._redmineFileUpload.uploadFiles([pdf]);
  await flush();
  assert.deepEqual(calls.paragraphs, [['paragraph', 'after:IMG']]);
  assert.equal(calls.inserted[0][2].at, 'in:paragraph');
});

test('marker position that no longer allows text gets a paragraph on success', async () => {
  let ready = false;
  const { editor, calls } = fakeEditor({ result: done, schema: { text: at => !ready || at.startsWith('in:') } });
  editor._redmineFileUpload.uploadFiles([pdf]);
  ready = true;
  await flush();
  assert.deepEqual(calls.paragraphs, [['paragraph', 'SEL']]);
  assert.equal(calls.inserted[0][2].at, 'in:paragraph');
});

test('disallowed linkHref inserts the plain filename', async () => {
  const { editor, calls } = fakeEditor({ result: done, schema: { link: false } });
  editor._redmineFileUpload.uploadFiles([pdf]);
  await flush();
  assert.equal(calls.inserted[0][0], 'doc.pdf');
  assert.deepEqual(calls.inserted[0][1], {});
});

test('marker moved to the graveyard inserts nothing', async () => {
  const { editor, markers, calls } = fakeEditor({ result: done, markerRoot: { rootName: '$graveyard' } });
  editor._redmineFileUpload.uploadFiles([pdf]);
  await flush();
  assert.equal(calls.inserted.length, 0);
  assert.equal(markers.size, 0);
});

test('destroying the editor aborts active loaders without alerts', async () => {
  const { editor, calls } = fakeEditor({ pending: true });
  editor._redmineFileUpload.uploadFiles([pdf]);
  editor.fire('destroy');
  editor.state = 'destroyed';
  await flush();
  assert.equal(calls.aborted.length, 1);
  assert.deepEqual(calls.alerts, []);
  assert.equal(calls.destroyed.length, 1);
});

test('read-only editor does not upload', () => {
  const { editor, calls } = fakeEditor({ readOnly: true });
  editor._redmineFileUpload.uploadFiles([pdf, png]);
  assert.deepEqual(calls.kinds, []);
  assert.deepEqual(calls.executed, []);
});

test('images fall back to document uploads when uploadImage is disabled', async () => {
  const { editor, calls } = fakeEditor({ result: done, uploadImage: false });
  editor._redmineFileUpload.uploadFiles([png]);
  await flush();
  assert.deepEqual(calls.executed, []);
  assert.deepEqual(calls.kinds, ['file']);
});
