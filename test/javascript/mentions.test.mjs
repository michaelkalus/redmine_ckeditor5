import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendQuery, userItems, issueItems, buildMentionFeeds, mentionText, RedmineMentions
} from '../../frontend/redmine_mentions.mjs';

test('appendQuery adds q with the right separator', () => {
  assert.equal(appendQuery('/m?project_id=1', 'j s'), '/m?project_id=1&q=j%20s');
  assert.equal(appendQuery('/m', '#'), '/m?q=%23');
});

test('userItems maps logins and drops invalid entries', () => {
  assert.deepEqual(userItems([{ login: 'jsmith', name: 'John Smith' }, { name: 'x' }, null]), [
    { id: '@jsmith', text: '@jsmith', login: 'jsmith', name: 'John Smith' }
  ]);
  assert.deepEqual(userItems({ error: 1 }), []);
});

test('issueItems maps core auto_complete JSON', () => {
  assert.deepEqual(issueItems([{ id: 7, label: 'Bug #7: Crash', value: 7 }, {}]), [
    { id: '#7', text: '#7', label: 'Bug #7: Crash' }
  ]);
});

test('buildMentionFeeds only creates feeds for given sources', async () => {
  const urls = [];
  const fetchJson = async url => { urls.push(url); return [{ login: 'jsmith', name: 'John' }]; };
  const feeds = buildMentionFeeds({ usersUrl: '/m?project_id=1' }, fetchJson);
  assert.equal(feeds.length, 1);
  assert.equal(feeds[0].marker, '@');
  const items = await feeds[0].feed('jo');
  assert.equal(urls[0], '/m?project_id=1&q=jo');
  assert.equal(items[0].id, '@jsmith');
  assert.deepEqual(buildMentionFeeds({}, fetchJson), []);
  assert.deepEqual(buildMentionFeeds(undefined, fetchJson), []);
});

test('feed errors resolve to an empty list', async () => {
  const feeds = buildMentionFeeds({ issuesUrl: '/i' }, async () => { throw new Error('403'); });
  assert.equal(feeds[0].marker, '#');
  assert.deepEqual(await feeds[0].feed('1'), []);
});

test('feed resolves to an empty list when the response is not JSON (login redirect)', async () => {
  const rejectParse = async () => { throw new SyntaxError('Unexpected token < in JSON'); };
  const feeds = buildMentionFeeds({ usersUrl: '/u', issuesUrl: '/i' }, rejectParse);
  assert.deepEqual(await feeds[0].feed('a'), []);
  assert.deepEqual(await feeds[1].feed('1'), []);
});

test('mentionText accepts objects and strings, rejects junk', () => {
  assert.equal(mentionText({ mention: { id: '@jsmith', text: '@jsmith' } }), '@jsmith');
  assert.equal(mentionText({ mention: '#12' }), '#12');
  assert.equal(mentionText({ mention: { id: '@a b' } }), null);
  assert.equal(mentionText(undefined), null);
});

test('RedmineMentions replaces the mention command with plain text', () => {
  let handler, priority, inserted, stopped = false;
  const editor = {
    on: (name, cb) => { assert.equal(name, 'ready'); cb(); },
    commands: { get: name => (name === 'mention' ? { on: (ev, cb, opts) => { handler = cb; priority = opts.priority; } } : null) },
    model: {
      document: { selection: { getFirstRange: () => 'SEL' } },
      change: cb => cb({ createText: text => ({ text }) }),
      insertContent: (node, range) => { inserted = { node, range }; }
    }
  };
  RedmineMentions(editor);
  assert.equal(priority, 'high');
  handler({ stop: () => { stopped = true; } }, [{ mention: { id: '@jsmith' }, range: 'R' }]);
  assert.equal(stopped, true);
  assert.deepEqual(inserted, { node: { text: '@jsmith ' }, range: 'R' });
});
