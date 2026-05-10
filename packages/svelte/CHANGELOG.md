# @somewhatintelligent/cc-ws-svelte

## 0.1.5

### Patch Changes

- Republish to fix `workspace:*` leak. The 0.1.4 tarball on npm has its `@somewhatintelligent/cc-ws-client` dependency literally as `"workspace:*"` because `changeset publish` (which shells out to `npm publish` per package) does not rewrite Bun's workspace protocol — see [changesets#1468](https://github.com/changesets/changesets/issues/1468) and [bun#16074](https://github.com/oven-sh/bun/issues/16074). The release pipeline now uses `bun publish` per package, which rewrites `workspace:*` to the resolved version. 0.1.4 is deprecated; use 0.1.5+.

## 0.1.4

### Patch Changes

- Updated dependencies
  - @somewhatintelligent/cc-ws-client@0.1.4
