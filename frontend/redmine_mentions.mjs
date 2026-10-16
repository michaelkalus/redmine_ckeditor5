export function appendQuery(url, query) {
  return `${url}${url.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`;
}

export function userItems(json) {
  return (Array.isArray(json) ? json : [])
    .filter(user => user && typeof user.login === 'string' && user.login)
    .map(user => ({ id: `@${user.login}`, text: `@${user.login}`, login: user.login, name: user.name || user.login }));
}

export function issueItems(json) {
  return (Array.isArray(json) ? json : [])
    .filter(issue => issue && issue.id)
    .map(issue => ({ id: `#${issue.id}`, text: `#${issue.id}`, label: issue.label || `#${issue.id}` }));
}

async function defaultFetchJson(url) {
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  return response.ok ? response.json() : [];
}

function renderItem(text) {
  const element = document.createElement('span');
  element.className = 'redmine-mention-item';
  element.textContent = text;
  return element;
}

export function buildMentionFeeds(sources, fetchJson = defaultFetchJson) {
  const feeds = [];
  if (sources?.usersUrl) {
    feeds.push({
      marker: '@',
      minimumCharacters: 1,
      feed: query => Promise.resolve().then(() => fetchJson(appendQuery(sources.usersUrl, query))).then(userItems, () => []),
      itemRenderer: item => renderItem(`${item.name} (@${item.login})`)
    });
  }
  if (sources?.issuesUrl) {
    feeds.push({
      marker: '#',
      minimumCharacters: 1,
      feed: query => Promise.resolve().then(() => fetchJson(appendQuery(sources.issuesUrl, query))).then(issueItems, () => []),
      itemRenderer: item => renderItem(item.label)
    });
  }
  return feeds;
}

export function mentionText(options) {
  const mention = options?.mention;
  const value = mention && typeof mention === 'object' ? (mention.text || mention.id) : (options?.text || mention);
  return typeof value === 'string' && /^[@#][^\s]+$/.test(value) ? value : null;
}

export function RedmineMentions(editor) {
  editor.on('ready', () => {
    const command = editor.commands.get('mention');
    if (!command) return;

    command.on('execute', (evt, args) => {
      const text = mentionText(args?.[0]);
      if (!text) return;

      evt.stop();
      editor.model.change(writer => {
        const range = args[0].range || editor.model.document.selection.getFirstRange();
        editor.model.insertContent(writer.createText(`${text} `), range);
      });
    }, { priority: 'high' });
  });
}
