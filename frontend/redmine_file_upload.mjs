import { attachmentsTarget } from './redmine_attachments.mjs';

export const IMAGE_TYPES = ['image/avif', 'image/bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp'];
const MARKER_GROUP = 'redmineFileUpload';

export function partitionFiles(files) {
  const images = [];
  const documents = [];
  Array.from(files || []).forEach(file => {
    (IMAGE_TYPES.includes(String(file?.type || '').toLowerCase()) ? images : documents).push(file);
  });
  return { images, documents };
}

export function clipboardAction({ files, html }) {
  if (!files || !files.length) return 'pass';
  if (html && html.trim()) return 'pass';
  return partitionFiles(files).documents.length ? 'handle' : 'pass';
}

function hasAttachmentsForm(editor) {
  return Boolean(attachmentsTarget(editor.sourceElement));
}

export function textInsertionPosition(editor, writer, position, element) {
  const schema = editor.model.schema;
  if (schema.checkChild(position, '$text')) return position;
  const range = schema.getNearestSelectionRange(position);
  if (range && schema.checkChild(range.start, '$text')) return range.start;
  let at = element ? writer.createPositionAfter(element) : position;
  while (at.parent?.parent && !schema.checkChild(at, 'paragraph')) at = writer.createPositionAfter(at.parent);
  const paragraph = writer.createElement('paragraph');
  writer.insert(paragraph, at);
  return writer.createPositionAt(paragraph, 0);
}

export function RedmineFileUpload(editor) {
  const labels = new Map();
  let counter = 0;
  const enabled = () => Boolean(editor.config.get('redmineUpload.fileUploadUrl')) && hasAttachmentsForm(editor);
  const active = new Set();
  let destroyed = false;
  const alive = () => !destroyed && editor.state !== 'destroyed';
  let fileRepository;
  const repository = () => fileRepository || (fileRepository = editor.plugins.get('FileRepository'));

  editor.on('destroy', () => {
    destroyed = true;
    active.forEach(loader => {
      try {
        loader.abort();
      } catch (_error) {}
    });
    active.clear();
  });

  editor.conversion.for('editingDowncast').markerToElement({
    model: MARKER_GROUP,
    view: (data, { writer }) => writer.createUIElement('span', { class: 'redmine-file-upload-pending' }, function(domDocument) {
      const element = this.toDomElement(domDocument);
      const label = editor.config.get('redmineUpload.uploadingLabel') || 'Uploading';
      element.textContent = `${label} ${labels.get(data.markerName) || ''}...`;
      return element;
    })
  });

  function createLoader(file) {
    editor._redmineUploadKind = 'file';
    try {
      return repository().createLoader(file);
    } finally {
      editor._redmineUploadKind = undefined;
    }
  }

  function selectionTextPosition(writer) {
    const selection = editor.model.document.selection;
    return textInsertionPosition(editor, writer, selection.getLastPosition(), selection.getSelectedElement?.());
  }

  function insertLink(writer, name, data, file) {
    const marker = editor.model.markers.get(name);
    if (!marker) return;
    let start = marker.getStart();
    if (start.root?.rootName === '$graveyard') start = selectionTextPosition(writer);
    const schema = editor.model.schema;
    if (!schema.checkChild(start, '$text')) start = textInsertionPosition(editor, writer, start);
    const text = data?.filename || file.name;
    const linkable = data?.default && schema.checkAttribute(schema.createContext(start).push('$text'), 'linkHref');
    writer.insertText(text, linkable ? { linkHref: data.default } : {}, start);
    writer.insertText(' ', start.getShiftedBy(text.length));
  }

  function uploadDocument(file, writer, at) {
    const loader = createLoader(file);
    if (!loader) return;

    const name = `${MARKER_GROUP}:${++counter}`;
    labels.set(name, file.name);
    writer.addMarker(name, { range: writer.createRange(at), usingOperation: false, affectsData: false });
    active.add(loader);

    loader.upload().then(data => {
      if (alive()) editor.model.change(changeWriter => insertLink(changeWriter, name, data, file));
    }).catch(error => {
      if (alive() && loader.status !== 'aborted') window.alert(error?.message || String(error));
    }).finally(() => {
      active.delete(loader);
      labels.delete(name);
      if (alive() && editor.model.markers.has(name)) editor.model.change(changeWriter => changeWriter.removeMarker(name));
      repository().destroyLoader(loader);
    });
  }

  function uploadFiles(files, position) {
    if (!alive() || !enabled() || editor.isReadOnly) return;
    if (editor.plugins.has?.('SourceEditing') && editor.plugins.get('SourceEditing').isSourceEditingMode) return;
    const { images, documents } = partitionFiles(files);
    if (!images.length && !documents.length) return;

    if (position) editor.model.change(writer => writer.setSelection(position));
    const command = editor.commands.get('uploadImage');
    command?.refresh?.();
    const withImages = images.length > 0 && Boolean(command?.isEnabled);
    const queue = withImages ? documents : documents.concat(images);
    if (withImages) editor.execute('uploadImage', { file: images });
    if (!queue.length) return;

    editor.model.change(writer => {
      const at = selectionTextPosition(writer);
      queue.forEach(file => uploadDocument(file, writer, at));
    });
  }

  editor._redmineFileUpload = { uploadFiles };

  editor.on('ready', () => {
    editor.editing.view.document.on('clipboardInput', (evt, data) => {
      if (editor.isReadOnly) return;
      const files = Array.from(data.dataTransfer?.files || []);
      const html = data.dataTransfer?.getData('text/html') || '';
      if (files.length && !html.trim() && !hasAttachmentsForm(editor)) {
        evt.stop();
        return;
      }
      if (!enabled()) return;
      if (clipboardAction({ files, html }) !== 'handle') return;

      evt.stop();
      const range = data.targetRanges?.[0];
      uploadFiles(files, range ? editor.editing.mapper.toModelRange(range).start : undefined);
    }, { priority: 'high' });
  });
}
