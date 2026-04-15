# macOS Menu Bar App

`apps/bridge-manager-macos` is the macOS-first product entrypoint for `figma-auto`.

It replaces the old workflow of manually running `scripts/start-local-bridge.sh` in separate terminals when you want multiple bridges.
Release builds package a bundled bridge runtime and prebuilt plugin manifests so normal users do not need repository paths during setup.
It runs as a menu bar only app and hides its Dock icon.
Each running bridge instance is exposed through one MCP connection model only: `http://localhost:<port>/mcp`.

## Run

Developer run from the repo:

```bash
cd apps/bridge-manager-macos
swift run
```

## Build `.app`

From the repository root:

```bash
npm run build:bridge-manager-app
```

This builds the Swift package in release mode and creates:

```bash
dist/FigmaAutoBridgeMenu.app
```

The default build now produces a universal binary so the app can launch on both Apple Silicon and Intel Macs.

Useful options:

```bash
./scripts/build-bridge-manager-app.sh --debug
./scripts/build-bridge-manager-app.sh --arch arm64
./scripts/build-bridge-manager-app.sh --arch x86_64
./scripts/build-bridge-manager-app.sh --output-dir /tmp/bridge-app
./scripts/build-bridge-manager-app.sh --sign "Developer ID Application: Your Name"
./scripts/build-bridge-manager-app.sh --no-sign
```

Notes:

- default signing is ad-hoc, which is fine for local use
- use `--sign` with a real certificate if you want to distribute the app outside your machine; ad-hoc signing is not sufficient for other machines
- the app build now bundles a `figma-auto-runtime` folder into `Contents/Resources`, including bridge assets, plugin manifests, and dependencies

## Build `.dmg`

From the repository root:

```bash
npm run build:bridge-manager-dmg
```

This builds the app bundle first, then creates:

```bash
dist/FigmaAutoBridgeMenu-1.0.0.dmg
```

Useful options:

```bash
./scripts/build-bridge-manager-dmg.sh --version 1.0.1
./scripts/build-bridge-manager-dmg.sh --output-dir /tmp/bridge-release
./scripts/build-bridge-manager-dmg.sh --volume-name "Figma Auto Bridge"
./scripts/build-bridge-manager-dmg.sh -- --sign "Developer ID Application: Your Name"
```

Notes:

- arguments after `--` are forwarded to `build-bridge-manager-app.sh`
- for distribution to other machines, sign the app with a real certificate before creating the dmg
- this script creates a simple install disk image with the app plus an `Applications` shortcut

## What It Does

- keeps a persistent list of business-friendly design file mappings
- boots with bundled default instances such as Marketing Landing, Product Flow, and Design System
- keeps a one-design-file-per-instance model so teams do not need to invent their own naming scheme
- starts and stops multiple bridge processes
- shows bridge runtime status plus plugin health, including a direct "run the plugin in Figma" prompt when disconnected
- reveals manifests, MCP URLs, logs, and plugin bundles with one-click copy/open actions
- gives Codex a stable long-running bridge process to connect to over HTTP MCP

## Bundled Runtime

The app now prefers a bundled `figma-auto-runtime` inside the app resources. Writable logs are stored under `~/Library/Application Support/figma-auto/bridge-manager/runtime-logs/`.

Use `Choose Dev Workspace` only when you intentionally want the menu bar app to point at a local repository checkout.

## Notes

- The release build ships prebuilt plugin manifests and bridge assets, so normal use does not require `npm run build` from the user.
- The app launches `npm` and `node` through `zsh -lc`, so your login shell environment must be able to resolve those commands.
- App state is stored at `~/Library/Application Support/figma-auto/bridge-manager/state.json`.
- If Codex should attach to a menu-bar-managed instance, configure Codex with `url = "http://localhost:<port>/mcp"` instead of a `command` entry for the same instance.
- The shortest operator SOP is: start the app, open the mapped Figma file, run the plugin, wait for green status, then copy the MCP URL.
