import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentsTarget } from '../../frontend/redmine_attachments.mjs';

const element = ({ host = null, form = null } = {}) => ({
  closest: selector => (selector === '[data-redmine-attachments]' ? host : selector === 'form' ? form : null)
});
const formWith = input => ({ querySelector: () => input });

test('prefers an element marked data-redmine-attachments', () => {
  const host = {};
  assert.equal(attachmentsTarget(element({ host, form: formWith({}) })), host);
});

test('uses a form only when it has a Redmine attachments field', () => {
  const form = formWith({});
  assert.equal(attachmentsTarget(element({ form })), form);
  assert.equal(attachmentsTarget(element({ form: formWith(null) })), null);
});

test('returns null without a target or element', () => {
  assert.equal(attachmentsTarget(element()), null);
  assert.equal(attachmentsTarget(null), null);
});
