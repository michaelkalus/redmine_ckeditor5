# Redmine CKEditor

CKEditor 5 integration for Redmine 6.1 and 7. It stores formatted text as HTML
and uses Redmine's native attachment storage for pasted and uploaded images.

This plugin is a new implementation by HicknHack Software GmbH, inspired by
Akihiro Ono's [original Redmine CKEditor plugin](https://github.com/a-ono/redmine_ckeditor).
It shares no code with the previous plugin.

## Fork additions

This fork (`michaelkalus/redmine_ckeditor5`, version `2.0.1-fork.1`) keeps the
plugin id `redmine_ckeditor` and adds the following on top of upstream.

- **Czech UI.** Editor language `cs`, localized headings and a Czech plugin
  locale (`config/locales/cs.yml`).
- **Mentions.** `@login` and `#id` mentions are stored as plain text, so
  Redmine core detects them and sends its normal notifications.
  - The `@` suggestions endpoint `/redmine_ckeditor/mentions/users` needs only
    `view_issues` (not `add_issue_watchers`). It matches login, first name and
    last name only (never e-mail) and returns only active, visible users who
    can see the issue (or who have `view_issues` in the project when no issue
    exists yet).
  - Quotes (`blockquote`), `pre` and `code` are not scanned for mentions.
- **Backref note.** When an issue is mentioned as `#N`, a note "Mentioned in #N"
  (Czech: "Zmineno v") is added to issue N. It is skipped for private issues
  and private notes, requires that the target is visible and that the author of
  the source has `add_issue_notes` on it, and is created once per source record
  (`journal:<id>` or `issue:<id>`). The author is not subscribed as a watcher
  of the target. Failures are logged and never break the save.
- **Document uploads.** The paperclip toolbar button, paste and drop upload
  files as unattached attachments (`POST /redmine_ckeditor/uploads?kind=file`).
  Redmine's attachment size and extension settings apply. A hidden token binds
  the attachments to the record on save. Remove orphans with
  `bundle exec rake redmine:attachments:prune`.
- **Settings.** Four flags, all enabled by default: `user_mentions`,
  `issue_mentions`, `issue_mention_backref` and `file_uploads`. With
  `file_uploads` on, `insertFile` is added to stored toolbars automatically.
- **Init fix (note for upstream).** `init.rb` calls `RedmineCkeditor.apply_patch`
  directly. Redmine 6.1 runs plugin `init.rb` inside a `to_prepare` callback,
  so a nested `to_prepare` registered there never runs.

### Syncing with upstream

```sh
git fetch upstream && git merge upstream/main
npm ci && npm run build
git add assets/javascripts/ckeditor5.js assets/javascripts/ckeditor5.css
git commit
```

The committed bundle must always equal the `npm run build` output; CI fails
otherwise.

## Compatibility

- Redmine 6.1 or newer
- Rails 7.2 (Redmine 6.1) or Rails 8.1 (Redmine 7)
- Ruby 3.2 through 3.4 for Redmine 6.1, or a Ruby version supported by Redmine 7
- CKEditor 5.48.5.2
- Redmine's Propshaft-based asset pipeline

The old runtime dependencies have been removed.

## Install or upgrade

1. Put this repository at `REDMINE_ROOT/plugins/redmine_ckeditor`.
2. Install Redmine's gems normally with `bundle install` (this plugin adds none).
3. Run the plugin migrations:

   ```sh
   bundle exec rake redmine:plugins:migrate RAILS_ENV=production
   ```

4. Precompile assets with Redmine's current asset task:

   ```sh
   bundle exec rake assets:precompile RAILS_ENV=production
   ```

5. Restart Redmine and select **CKEditor** under Administration → Settings →
   General → Text formatting.

Do not copy assets manually into `public/plugin_assets`. Redmine 6.1 and 7
discover the plugin's `assets/` tree through Propshaft and fingerprint it during
precompile.

## Automatic Rich migration

The first 2.0 migration automatically:

1. Finds every row in the legacy `rich_rich_files` table.
2. Recognizes the original Rich and `cw_rich` Paperclip directory/URL layouts.
3. Copies each original upload into Redmine's native `Attachment` storage.
4. Associates scoped files with their Redmine owner when possible.
5. Rewrites legacy image/link URLs in current and historical formatted content.
6. Stores the original content in `redmine_ckeditor_content_backups` so a plugin
   migration rollback can restore it.

The legacy table and original files are intentionally not deleted. Missing or
externally stored files are recorded as migration errors without damaging their
old references. After restoring missing files, retry and obtain a report with:

```sh
bundle exec rake redmine_ckeditor:migrate_legacy RAILS_ENV=production
```

As with every storage migration, make a database and uploads backup before the
upgrade. Rolling the plugin back to version 0 restores rewritten content and
deletes only the native attachments created by this migration; the original
Rich data remains available.

## Configuration

Plugin settings control editor height and toolbar items. CKEditor 4 toolbar names
already stored in Redmine settings are translated to CKEditor 5 names at runtime.

The legacy width, UI color, startup block outlines, and toolbar-overflow settings
are retained. Justification buttons migrate to CKEditor 5's alignment dropdown,
and explicit toolbar line breaks remain line breaks. CKEditor 5 does not have
CKEditor 4 skins or Enter/Shift+Enter output modes. Its Classic editor also has
no supported toolbar-location setting; UI theming now uses CSS custom properties
in `assets/stylesheets/editor.css`. Its `style` toolbar item is supported, but
CKEditor 5 requires explicit `style.definitions`; an example is included in
`config/ckeditor.yml.example`, so the old generic Styles list is not guessed.

For advanced settings, copy `config/ckeditor.yml.example` to
`REDMINE_ROOT/config/ckeditor.yml`. The same file also controls the server-side
HTML sanitizer allowlists.

CKEditor 5.48.5.2 requires a license key. The plugin defaults to the `GPL` key;
use that setting only when the deployment complies with CKEditor's GPL terms.
Otherwise, configure an appropriate commercial self-hosting key.

## Version dependencies

The plugin is the integration layer between Redmine and CKEditor. Redmine owns
the forms, permissions, preview endpoints, attachment records, asset pipeline,
and persisted HTML. CKEditor supplies the browser-side editing UI. The compiled
CKEditor JavaScript and CSS are committed to this repository, so production
servers do not install or update CKEditor independently.

`package.json` pins the tested CKEditor version exactly. A CKEditor update does
not normally require a Redmine database migration, but it does require a new
plugin build and release. Changes to CKEditor plugin APIs, configuration, HTML
output, licensing, or browser support can require integration changes. Changes
to Redmine's formatter API, forms, attachment API, or asset pipeline can require
plugin changes even when the CKEditor version stays the same. The CI matrix is
the authoritative list of combinations tested by this branch.

## Updating CKEditor

See [changelog.md](changelog.md) for release history and version-specific changes.

Normal Redmine deployments do not need Node.js because compiled assets are
committed. To update the editor bundle:

```sh
npm install --save-exact ckeditor5@VERSION
npm audit --omit=dev
npm test
npm run build
```

Before updating, read CKEditor's release notes and every applicable migration
guide between the installed and target versions. Keep `ckeditor5` pinned to an
exact version, adapt `frontend/ckeditor5.js` and the integration/configuration
when required, and commit `package.json`, `package-lock.json`,
`assets/javascripts/ckeditor5.js`, and `assets/javascripts/ckeditor5.css`.

Run the complete Redmine/database CI matrix before publishing a plugin release.
For a security-only editor update, the same build and test process applies;
deploying only a changed npm dependency does nothing because Redmine serves the
committed compiled bundle. After deploying the new plugin revision, precompile
assets and restart Redmine as described above.

## Tests

The GitHub Actions workflow installs the plugin into clean Redmine 6.1 and 7
checkouts, rebuilds CKEditor, migrates SQLite, PostgreSQL, and MySQL databases,
precompiles production assets, and runs the plugin test suite on Ruby versions
supported by each Redmine release. It runs for pushes and pull requests and can
also be started manually from the Actions tab.

When the plugin is installed in a local Redmine checkout, run the same test suite
from the Redmine root with:

```sh
RAILS_ENV=test bundle exec rails test plugins/redmine_ckeditor/test
```

## License

The redmine_ckeditor integration code is available under the [MIT License](LICENSE).

CKEditor itself is third-party software and is **not** relicensed by this
project's MIT License. CKEditor 5 is available under its own open-source and
commercial license options; see the official
[CKEditor licensing page](https://ckeditor.com/legal/ckeditor-licensing-options/)
for the current terms. Each user is responsible for deciding which CKEditor
license applies to their use and distribution, and for configuring the
corresponding license key. The plugin's default `GPL` key does not make that
decision for the user.
