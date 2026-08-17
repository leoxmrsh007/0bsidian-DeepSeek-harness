# Release checklist

This plugin ships as a standard Obsidian community plugin: a GitHub Release
carrying `main.js`, `manifest.json`, and `styles.css`, plus a PR to
`obsidianmd/obsidian-releases` for the in-app directory.

## 1. Pre-release checks

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

All four must pass. `npm run build` must emit a fresh `main.js` + `styles.css`.

Verify version consistency (all three must match):

```sh
node scripts/check-release-version.mjs 0.1.0
cat versions.json   # {"0.1.0": "1.7.2"}
```

## 2. First release (one-time)

1. Create the GitHub repo `deepseek-harness-obsidian` under your account
   (`leoxmrsh007`). The local remote already points at
   `https://github.com/leoxmrsh007/deepseek-harness-obsidian.git`.
2. Push the branch and the tag:

   ```sh
   git push -u origin main
   git tag 0.1.0
   git push origin 0.1.0
   ```

Pushing the `0.1.0` tag triggers `.github/workflows/release.yml`, which
builds the plugin and publishes a GitHub Release with the three artifacts.

## 3. Submit to the Obsidian community plugin directory

After the first Release exists:

1. Fork `obsidianmd/obsidian-releases`.
2. Add a `deepseek-harness.json` entry to `community-plugins.json`
   (id, name, author, description, repo).
3. Commit your `manifest.json` and `versions.json` under
   `plugins/deepseek-harness/`? — no, the directory only holds the JSON
   submission; the manifest/versions live in this repo and are read from the
   latest release. Open a PR to `obsidianmd/obsidian-releases` with the
   `community-plugins.json` change.

## 4. Subsequent releases

```sh
npm version patch            # or minor / major; syncs manifest.json
git push --follow-tags
```

Each new semver tag produces a new Release automatically. Update
`versions.json` when the minimum Obsidian version changes.
