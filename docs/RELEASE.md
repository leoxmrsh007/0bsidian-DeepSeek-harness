# Release checklist

DeepSeek Vault Harness ships through GitHub Releases. Each release must contain
`main.js`, `manifest.json`, and `styles.css`.

## 1. Pre-release checks

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Verify that the tag, `package.json`, and `manifest.json` use the same version:

```sh
node scripts/check-release-version.mjs 0.1.3
```

`versions.json` only needs an update when `minAppVersion` changes.

## 2. Publish a release

```sh
npm version patch            # or minor / major; syncs manifest.json
git push --follow-tags
```

Pushing the semver tag triggers `.github/workflows/release.yml`, which builds
and publishes the GitHub Release assets.

## 3. Submit the first release to the Obsidian Community directory

Community plugin submissions are managed at
[community.obsidian.md](https://community.obsidian.md), not through pull
requests to `obsidianmd/obsidian-releases`.

1. Sign in with an Obsidian account.
2. In **Profile**, connect the GitHub account that owns
   `leoxmrsh007/0bsidian-DeepSeek-harness`.
3. Select **Plugins** → **New plugin**.
4. Submit `https://github.com/leoxmrsh007/0bsidian-DeepSeek-harness` with:
   - ID: `deepseek-vault-harness`
   - Name: `DeepSeek Vault Harness`
5. Agree to the Developer Policies and submit for automated review.

The directory reads `manifest.json` from the default branch and installs the
matching GitHub Release tag.
