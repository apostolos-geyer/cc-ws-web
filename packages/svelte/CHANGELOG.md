# @somewhatintelligent/cc-ws-svelte

## 0.1.7

### Patch Changes

- Updated dependencies [3eb13bc]
  - @somewhatintelligent/cc-ws-client@0.2.0

## 0.1.6

### Patch Changes

- Republish to fix stale lockfile resolution. The 0.1.5 tarball on npm has `@somewhatintelligent/cc-ws-client: "0.1.3"` because `bun publish` resolves `workspace:*` against the lockfile's workspace metadata, and the lockfile entry for `cc-ws-client` was carrying a stale version from a prior release cycle. The lockfile has since been rebuilt against current package.json files. 0.1.5 is deprecated; use 0.1.6+.

## 0.1.5

### Patch Changes

- Republish to fix `workspace:*` leak. The 0.1.4 tarball on npm has its `@somewhatintelligent/cc-ws-client` dependency literally as `"workspace:*"` because `changeset publish` (which shells out to `npm publish` per package) does not rewrite Bun's workspace protocol — see [changesets#1468](https://github.com/changesets/changesets/issues/1468) and [bun#16074](https://github.com/oven-sh/bun/issues/16074). The release pipeline now uses `bun publish` per package, which rewrites `workspace:*` to the resolved version. 0.1.4 is deprecated; use 0.1.5+.

## 0.1.4

### Patch Changes

- Updated dependencies
  - @somewhatintelligent/cc-ws-client@0.1.4
