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

function fakeEditor({ result, error, status = 'idle', config = {}, form = true, schema = {}, uploadImage = true, readOnly = false, pending = false, markerRoot, afterImage, abortThrows = false, sourceMode, host } = {}) {
  const markers = new Map();
  const listeners = new Map();
  const calls = { inserted: [], alerts: [], destroyed: [], executed: [], kinds: [], selection: [], log: [], paragraphs: [], aborted: [], refreshed: 0, markersAt: [] };
  let current = 'SEL';
  const key = at => (at && typeof at === 'object' ? at.at : at);
  const position = (at, root) => ({ at, ...(root ? { root } : {}), getShiftedBy: n => ({ at, shift: n }) });
  const writer = {
    createRange: at => ({ at }),
    addMarker: (name, { range }) => {
      calls.log.push('marker');
      calls.markersAt.push(key(range.at));
      markers.set(name, { getStart: () => position(key(range.at), markerRoot) });
    },
    removeMarker: name => markers.delete(name),
    insertText: (...args) => calls.inserted.push(args),
    setSelection: at => {
      calls.selection.push(at);
      current = at;
    },
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
    sourceElement: {
      closest: selector => {
        if (selector === '[data-redmine-attachments]') return host || null;
        return form ? { querySelector: () => ({}) } : null;
      }
    },
    editing: { view: { document: { on: (name, callback) => listeners.set(`view:${name}`, callback) } }, mapper: { toModelRange: () => ({ start: 'DROP' }) } },
    commands: {
      get: name => (name === 'uploadImage' ? {
        get isEnabled() { return typeof uploadImage === 'function' ? uploadImage(current) : uploadImage; },
        refresh: () => { calls.refreshed++; }
      } : null)
    },
    execute: (name, args) => {
      calls.log.push('execute');
      calls.executed.push([name, args]);
      if (afterImage) current = afterImage;
    },
    model: {
      markers: { get: name => markers.get(name), has: name => markers.has(name) },
      document: { selection: { getFirstPosition: () => position(current), getLastPosition: () => position(current), getSelectedElement: () => schema.selected || null } },
      schema: {
        checkChild: (at, child) => check(child === '$text' ? schema.text : schema.paragraph, at),
        checkAttribute: () => schema.link !== false,
        createContext: () => ({ push: () => ({}) }),
        getNearestSelectionRange: () => (schema.nearest ? { start: schema.nearest } : null)
      },
      change: cb => cb(writer)
    },
    plugins: {
      has: name => name === 'SourceEditing' && sourceMode !== undefined,
      get: name => name === 'SourceEditing' ? { isSourceEditingMode: sourceMode } : ({
        createLoader: file => {
          calls.kinds.push(editor._redmineUploadKind);
          const loader = { file, status };
          let reject;
          loader.upload = () => {
            if (pending) return new Promise((_resolve, rejecter) => { reject = rejecter; });
            return error ? Promise.reject(error) : Promise.resolve(result);
          };
          const throws = abortThrows && calls.kinds.length === 1;
          loader.abort = () => {
            loader.status = 'aborted';
            calls.aborted.push(loader);
            reject?.(new Error('aborted'));
            if (throws) throw new Error('abort failed');
          };
          return loader;
        },
        destroyLoader: loader => calls.destroyed.push(loader)
      })
    }
  };
  global.window = { alert: message => calls.alerts.push(message) };
  RedmineFileUpload(editor);
  return { editor, markers, calls, listeners };
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

test('mixed drop runs uploadImage first and places markers at the post-image selection', async () => {
  const { editor, calls } = fakeEditor({ result: done, afterImage: 'AFTER_IMG' });
  editor._redmineFileUpload.uploadFiles([png, pdf], 'DROP');
  assert.deepEqual(calls.log, ['execute', 'marker']);
  assert.deepEqual(calls.markersAt, ['AFTER_IMG']);
  await flush();
  assert.equal(calls.inserted[0][2].at, 'AFTER_IMG');
});

test('uploadImage availability is decided after the drop selection is set', () => {
  const { editor, calls } = fakeEditor({ result: done, uploadImage: at => at === 'DROP' });
  editor._redmineFileUpload.uploadFiles([png], 'DROP');
  assert.equal(calls.refreshed, 1);
  assert.deepEqual(calls.executed, [['uploadImage', { file: [png] }]]);
  assert.deepEqual(calls.kinds, []);
});

test('mixed drop whose marker ends in the graveyard still inserts the link at the selection', async () => {
  const { editor, calls } = fakeEditor({ result: done, afterImage: 'AFTER_IMG', markerRoot: { rootName: '$graveyard' } });
  editor._redmineFileUpload.uploadFiles([png, pdf], 'DROP');
  await flush();
  assert.equal(calls.inserted.length, 2);
  assert.equal(calls.inserted[0][0], 'doc.pdf');
  assert.equal(calls.inserted[0][2].at, 'AFTER_IMG');
  assert.deepEqual(calls.alerts, []);
});

test('uploadFiles does nothing after the editor is destroyed', () => {
  const { editor, calls } = fakeEditor({ result: done });
  editor.fire('destroy');
  editor._redmineFileUpload.uploadFiles([pdf, png]);
  assert.deepEqual(calls.kinds, []);
  assert.deepEqual(calls.executed, []);
});

test('a throwing abort does not stop other aborts on destroy', async () => {
  const { editor, calls } = fakeEditor({ pending: true, abortThrows: true });
  editor._redmineFileUpload.uploadFiles([pdf, { name: 'b.docx', type: 'application/msword' }]);
  editor.fire('destroy');
  await flush();
  assert.equal(calls.aborted.length, 2);
  assert.deepEqual(calls.alerts, []);
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

test('marker moved to the graveyard re-resolves the position from the selection', async () => {
  const { editor, markers, calls } = fakeEditor({ result: done, markerRoot: { rootName: '$graveyard' } });
  editor._redmineFileUpload.uploadFiles([pdf]);
  await flush();
  assert.equal(calls.inserted[0][2].at, 'SEL');
  assert.equal(calls.inserted.length, 2);
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

test('source editing mode does not upload', () => {
  const { editor, calls } = fakeEditor({ sourceMode: true });
  editor._redmineFileUpload.uploadFiles([pdf]);
  assert.equal(calls.kinds.length, 0);
});

test('wysiwyg mode with the source editing plugin uploads', () => {
  const { editor, calls } = fakeEditor({ sourceMode: false });
  editor._redmineFileUpload.uploadFiles([pdf]);
  assert.equal(calls.kinds.length, 1);
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

function clipboard(files, html = '') {
  let stopped = false;
  return {
    evt: { stop: () => { stopped = true; } },
    data: { dataTransfer: { files, getData: type => (type === 'text/html' ? html : '') } },
    stopped: () => stopped
  };
}

function pasteInto(listeners, files, html = '') {
  let stopped = false;
  listeners.get('ready')();
  listeners.get('view:clipboardInput')(
    { stop: () => { stopped = true; } },
    { dataTransfer: { files, getData: type => (type === 'text/html' ? html : '') } }
  );
  return stopped;
}

test('files pasted where no attachments target exists are dropped silently', async () => {
  const { listeners, calls } = fakeEditor({ form: false });
  assert.equal(pasteInto(listeners, [png]), true);
  assert.equal(pasteInto(listeners, [pdf]), true);
  await flush();
  assert.deepEqual(calls.alerts, []);
  assert.deepEqual(calls.executed, []);
  assert.deepEqual(calls.kinds, []);
});

test('rich text paste without an attachments target is left to the editor', () => {
  const { listeners } = fakeEditor({ form: false });
  assert.equal(pasteInto(listeners, [png], '<p>x</p>'), false);
});

test('an element marked data-redmine-attachments enables uploads outside forms', async () => {
  const { editor, calls } = fakeEditor({ form: false, host: { dataset: {} }, result: { default: '/a/1/doc.pdf', filename: 'doc.pdf', id: 1 } });
  editor._redmineFileUpload.uploadFiles([pdf]);
  await flush();
  assert.deepEqual(calls.kinds, ['file']);
});
