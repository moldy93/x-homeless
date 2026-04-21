# No For You

Chrome extension for X that keeps `/home` on `Following` instead of `For you`, then makes one best-effort try to keep the feed on newest sort when X exposes the sort menu.

## Stack

- TypeScript
- Manifest V3
- `pnpm`
- `esbuild`
- `Vitest` + `jsdom`

## Install

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Then open `chrome://extensions`, enable developer mode, click `Load unpacked`, and select [dist](/Volumes/mdata/workspace/x-homeless/dist).

## Scripts

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Behavior

- Runs only on `https://x.com/*` and `https://twitter.com/*`
- Runs only on `/home`
- Uses the first two home tabs only:
  - tab `0` = `For you`
  - tab `1` = `Following`
- Ignores later custom tabs
- Cloaks the home timeline for up to `1500ms` during enforcement
- If X exposes a binary sort menu on the selected `Following` tab, tries the alternate option once and keeps it only if feed order improves
- If selectors break, uncloaks and stops fighting instead of blocking the page

## Known Limits

- X changes its DOM often. This extension may need selector updates later.
- Sort mode is inferred from visible post timestamps, not localized menu text.
- If X removes the sort menu, the extension still forces `Following` but skips sort logic.
