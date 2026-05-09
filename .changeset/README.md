# Changesets

This directory holds [changesets](https://github.com/changesets/changesets) — small markdown files that describe what's changed and how to bump the affected package versions.

## Adding a changeset

When you make a change that should ship as a release:

```sh
bun run changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a one-line summary. Commit the resulting `.changeset/*.md` file alongside your code.

The release workflow (`.github/workflows/release.yml`) takes over from there:

1. **On push to `trunk`** — if any changesets exist, the bot opens (or updates) a *"Version Packages"* PR that consumes every pending changeset, bumps versions in `package.json`, and writes `CHANGELOG.md` entries.
2. **When that PR merges** — the workflow re-runs and publishes the bumped packages to npm.

## Local commands

| Command | What it does |
| --- | --- |
| `bun run changeset` | Interactive: write a new changeset. |
| `bun run version` | Apply all pending changesets locally (bumps versions, updates changelogs). Run by CI; rarely needed by hand. |
| `bun run release` | `bun run build` then `changeset publish`. Run by CI. |

## What's in / out

Publishable: `cc-ws-client`, `cc-ws-server`, `cc-ws-element`, `cc-ws-react`.

Ignored (private / app code; see `config.json → ignore`): `cc-ws-svelte`, `app-web`, `app-react`, `cc-ws-web`.
