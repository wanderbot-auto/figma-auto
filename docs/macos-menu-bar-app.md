# macOS Menu Bar App

`apps/bridge-manager-macos` is a Swift menu bar app for managing multiple local `figma-auto` bridge instances.

It replaces the old workflow of manually running `scripts/start-local-bridge.sh` in separate terminals when you want multiple bridges.
It runs as a menu bar only app and hides its Dock icon.

## Run

```bash
cd apps/bridge-manager-macos
swift run
```

## What It Does

- keeps a persistent list of named bridge instances
- derives ports from the same instance-name hashing rule as the old scripts
- generates per-instance plugin bundles in `apps/figma-plugin/instances/<name>/`
- starts and stops multiple bridge processes
- shows running, busy, stopped, and failed bridge status with a richer control surface UI
- writes bridge logs to `logs/<name>/bridge.log`
- writes audit logs to `logs/<name>/audit.ndjson`
- reveals manifests and logs in Finder for quick import/debugging

## Workspace Detection

The app tries to auto-detect the `figma-auto` repo root. If it cannot, use `Choose Workspace` in the menu bar panel and select the repository root.

## Notes

- The app uses `npm run build` before start when `Auto build on start` is enabled.
- The app launches `npm` and `node` through `zsh -lc`, so your login shell environment must be able to resolve those commands.
- App state is stored at `~/Library/Application Support/figma-auto/bridge-manager/state.json`.
