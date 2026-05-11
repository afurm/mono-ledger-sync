# Release Process

`mono-ledger-sync` publishes from GitHub Actions with npm Trusted Publishing. This avoids long-lived npm publish tokens and lets npm attach provenance to public releases.

## One-time npm setup

In the npm package settings for `mono-ledger-sync`, configure Trusted Publishing:

- Publisher: GitHub Actions
- Organization or user: `afurm`
- Repository: `mono-ledger-sync`
- Workflow filename: `release.yml`
- Environment name: `npm`

The repository already uses a GitHub environment named `npm` for release approval. Approve that environment deployment when the release workflow asks for review.

After Trusted Publishing is working, set package publishing access to require two-factor authentication and disallow tokens.

## Release a new version

1. Land a PR that bumps `package.json` and `package-lock.json` to the new version.
2. From the updated `main` branch, create and push the matching tag:

   ```sh
   git switch main
   git pull --ff-only
   git tag v0.1.2
   git push origin v0.1.2
   ```

3. GitHub Actions verifies the tag matches `package.json`, runs validation, publishes to npm, and creates the matching GitHub Release.
4. Verify the registry:

   ```sh
   npm view mono-ledger-sync version dist-tags.latest
   ```

Do not publish from a tag that does not match `package.json` version.

If the workflow fails with `ENEEDAUTH`, check the npm Trusted Publisher settings first. The workflow filename and environment name must match exactly.
