import {
  AccessibilityHelp,
  Alignment,
  Autoformat,
  AutoImage,
  AutoLink,
  BlockQuote,
  Bold,
  ButtonView,
  Code,
  CodeBlock,
  Essentials,
  FindAndReplace,
  FontBackgroundColor,
  FontColor,
  FontFamily,
  FontSize,
  GeneralHtmlSupport,
  Heading,
  Highlight,
  HorizontalLine,
  Image,
  ImageCaption,
  ImageInsert,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Indent,
  IndentBlock,
  Italic,
  Link,
  LinkImage,
  List,
  ListProperties,
  MediaEmbed,
  Mention,
  Paragraph,
  PasteFromOffice,
  RemoveFormat,
  ShowBlocks,
  SourceEditing,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Style,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableCaption,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  TodoList,
  Underline
} from 'ckeditor5';
import { ClassicEditor } from 'ckeditor5';
import { RedmineMentions, buildMentionFeeds } from './redmine_mentions.mjs';
import { RedmineFileUpload } from './redmine_file_upload.mjs';
import 'ckeditor5/ckeditor5.css';
import csTranslations from 'ckeditor5/translations/cs.js';

class RedmineUploadAdapter {
  constructor(loader, editor, kind = 'image') {
    this.loader = loader;
    this.editor = editor;
    this.kind = kind;
    this.controller = new AbortController();
  }

  async upload() {
    const file = await this.loader.file;
    const uploadUrl = this.editor.config.get(this.kind === 'file' ? 'redmineUpload.fileUploadUrl' : 'redmineUpload.uploadUrl');
    const form = this.editor.sourceElement?.closest('form');
    const attachmentInput = form?.querySelector('.attachments_form input[type="file"][name^="attachments["]');

    if (!uploadUrl || !form || !attachmentInput) {
      throw new Error('Uploads are not available in this form.');
    }

    const body = new FormData();
    body.append('upload', file, file.name);

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body,
      credentials: 'same-origin',
      // Keep this a browser/session request. Redmine deliberately ignores the
      // session for JSON API requests and would otherwise see an anonymous user.
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken, Accept: 'text/plain' } : { Accept: 'text/plain' },
      signal: this.controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url || !payload.token) {
      throw new Error(payload.error || `Upload failed (${response.status}).`);
    }

    this.addAttachmentFields(form, payload);
    return { default: payload.url, filename: payload.filename, id: payload.id };
  }

  abort() {
    this.controller.abort();
  }

  addAttachmentFields(form, payload) {
    if (form.querySelector(`[data-ckeditor-attachment-id="${payload.id}"]`)) return;

    const key = `ckeditor_${payload.id}`;
    const fields = document.createElement('span');
    fields.hidden = true;
    fields.dataset.ckeditorAttachmentId = payload.id;
    fields.innerHTML =
      `<input type="hidden" name="attachments[${key}][token]">` +
      `<input type="hidden" name="attachments[${key}][filename]">`;
    fields.children[0].value = payload.token;
    fields.children[1].value = payload.filename;
    form.append(fields);
  }
}

function RedmineUpload(editor) {
  editor.plugins.get('FileRepository').createUploadAdapter = loader => new RedmineUploadAdapter(loader, editor, editor._redmineUploadKind || 'image');
}

const PAPERCLIP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M13.5 5.5v8a3.5 3.5 0 0 1-7 0v-9a2.25 2.25 0 0 1 4.5 0v8.5a1 1 0 0 1-2 0V5.5H7.75V13a2.25 2.25 0 0 0 4.5 0V4.5a3.75 3.75 0 0 0-7.5 0v9a5 5 0 0 0 10 0v-8z"/></svg>';

function RedmineFileUploadButton(editor) {
  editor.ui.componentFactory.add('insertFile', locale => {
    const button = new ButtonView(locale);
    button.set({ label: editor.config.get('redmineUpload.insertFileLabel') || 'Insert file', icon: PAPERCLIP_ICON, tooltip: true });
    if (editor.plugins.has('SourceEditing')) {
      button.bind('isEnabled').to(editor, 'isReadOnly', editor.plugins.get('SourceEditing'), 'isSourceEditingMode', (readOnly, source) => !readOnly && !source);
    } else {
      button.bind('isEnabled').to(editor, 'isReadOnly', value => !value);
    }
    button.on('execute', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.addEventListener('change', () => editor._redmineFileUpload?.uploadFiles(Array.from(input.files || [])));
      input.click();
    });
    return button;
  });
}

window.RedmineCKEditor5 = {
  ClassicEditor,
  RedmineUpload,
  buildMentionFeeds,
  extraPlugins: [RedmineMentions, RedmineFileUpload, RedmineFileUploadButton],
  translations: { cs: csTranslations },
  plugins: [
    AccessibilityHelp,
    Alignment,
    Autoformat,
    AutoImage,
    AutoLink,
    BlockQuote,
    Bold,
    Code,
    CodeBlock,
    Essentials,
    FindAndReplace,
    FontBackgroundColor,
    FontColor,
    FontFamily,
    FontSize,
    GeneralHtmlSupport,
    Heading,
    Highlight,
    HorizontalLine,
    Image,
    ImageCaption,
    ImageInsert,
    ImageResize,
    ImageStyle,
    ImageToolbar,
    ImageUpload,
    Indent,
    IndentBlock,
    Italic,
    Link,
    LinkImage,
    List,
    ListProperties,
    MediaEmbed,
    Mention,
    Paragraph,
    PasteFromOffice,
    RemoveFormat,
    ShowBlocks,
    SourceEditing,
    SpecialCharacters,
    SpecialCharactersEssentials,
    Style,
    Strikethrough,
    Subscript,
    Superscript,
    Table,
    TableCaption,
    TableCellProperties,
    TableColumnResize,
    TableProperties,
    TableToolbar,
    TodoList,
    Underline
  ]
};
