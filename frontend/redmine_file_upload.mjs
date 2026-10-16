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
  return Boolean(editor.sourceElement?.closest('form')?.querySelector('.attachments_form input[type="file"][name^="attachments["]'));
}

export function RedmineFileUpload(editor) {
  const labels = new Map();
  let counter = 0;
  const enabled = () => Boolean(editor.config.get('redmineUpload.fileUploadUrl')) && hasAttachmentsForm(editor);
  const alive = () => editor.state !== 'destroyed';

  editor.conversion.for('editingDowncast').markerToElement({
    model: MARKER_GROUP,
    view: (data, { writer }) => writer.createUIElement('span', { class: 'redmine-file-upload-pending' }, function(domDocument) {
      const element = this.toDomElement(domDocument);
      const label = editor.config.get('redmineUpload.uploadingLabel') || 'Uploading';
      element.textContent = `${label} ${labels.get(data.markerName) || ''}...`;
      return element;
    })
  });

  function uploadDocument(file, position) {
    const repository = editor.plugins.get('FileRepository');
    let loader;
    editor._redmineUploadKind = 'file';
    try {
      loader = repository.createLoader(file);
    } finally {
      editor._redmineUploadKind = undefined;
    }
    if (!loader) return;

    const name = `${MARKER_GROUP}:${++counter}`;
    labels.set(name, file.name);
    editor.model.change(writer => {
      const at = position || editor.model.document.selection.getFirstPosition();
      writer.addMarker(name, { range: writer.createRange(at), usingOperation: false, affectsData: false });
    });

    loader.upload().then(data => {
      if (!alive()) return;
      editor.model.change(writer => {
        const marker = editor.model.markers.get(name);
        if (!marker) return;
        const start = marker.getStart();
        const text = data?.filename || file.name;
        writer.insertText(text, { linkHref: data.default }, start);
        writer.insertText(' ', start.getShiftedBy(text.length));
      });
    }).catch(error => {
      if (loader.status !== 'aborted') window.alert(error?.message || String(error));
    }).finally(() => {
      labels.delete(name);
      if (alive() && editor.model.markers.has(name)) editor.model.change(writer => writer.removeMarker(name));
      repository.destroyLoader(loader);
    });
  }

  function uploadFiles(files, position) {
    if (!enabled()) return;
    const { images, documents } = partitionFiles(files);
    if (!documents.length && !images.length) return;
    if (position) editor.model.change(writer => writer.setSelection(position));
    if (images.length && editor.commands.get('uploadImage')?.isEnabled) editor.execute('uploadImage', { file: images });
    documents.forEach(file => uploadDocument(file, position));
  }

  editor._redmineFileUpload = { uploadFiles };

  editor.on('ready', () => {
    editor.editing.view.document.on('clipboardInput', (evt, data) => {
      if (!enabled() || editor.isReadOnly) return;
      const files = Array.from(data.dataTransfer?.files || []);
      const html = data.dataTransfer?.getData('text/html') || '';
      if (clipboardAction({ files, html }) !== 'handle') return;

      evt.stop();
      const range = data.targetRanges?.[0];
      uploadFiles(files, range ? editor.editing.mapper.toModelRange(range).start : undefined);
    }, { priority: 'high' });
  });
}
