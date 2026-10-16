import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../assets/stylesheets/editor.css', import.meta.url), 'utf8');

test('hidden editor stays hidden with the bottom toolbar layout', () => {
  const flex = css.indexOf('.redmine-ckeditor-wrapper.redmine-ckeditor-toolbar-bottom {');
  const hidden = css.search(/\.redmine-ckeditor-wrapper\[hidden\]\s*\{\s*display:\s*none;/);
  assert.ok(flex >= 0, 'bottom toolbar flex rule missing');
  assert.ok(hidden > flex, 'no [hidden] rule after the flex rule; preview would show the editor too');
});
