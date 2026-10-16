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

function fakeEditor({ result, error, status = 'idle', config = {}, form = true } = {}) {
  const markers = new Map();
  const calls = { inserted: [], alerts: [], destroyed: [], executed: [], kinds: [], selection: [] };
  const writer = {
    createRange: at => ({ at }),
    addMarker: (name, { range }) => markers.set(name, { getStart: () => ({ at: range.at, getShiftedBy: n => ({ at: range.at, shift: n }) }) }),
    removeMarker: name => markers.delete(name),
    insertText: (...args) => calls.inserted.push(args),
    setSelection: position => calls.selection.push(position)
  };
  const editor = {
    state: 'ready',
    isReadOnly: false,
    on: () => {},
    conversion: { for: () => ({ markerToElement: () => {} }) },
    config: { get: key => ({ 'redmineUpload.fileUploadUrl': '/u?kind=file', ...config })[key] },
    sourceElement: { closest: () => (form ? { querySelector: () => ({}) } : null) },
    commands: { get: name => (name === 'uploadImage' ? { isEnabled: true } : null) },
    execute: (name, args) => calls.executed.push([name, args]),
    model: {
      markers: { get: name => markers.get(name), has: name => markers.has(name) },
      document: { selection: { getFirstPosition: () => 'SEL' } },
      change: cb => cb(writer)
    },
    plugins: {
      get: () => ({
        createLoader: file => {
          calls.kinds.push(editor._redmineUploadKind);
          return { file, status, upload: () => (error ? Promise.reject(error) : Promise.resolve(result)) };
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
