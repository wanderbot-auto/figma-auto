# Local Development

## Main Commands

```bash
npm install
npm run build
npm run start:local
```

Fast paths:

- `npm run dev:bridge`
- `npm run build:bridge`
- `npm run build:plugin`
- `npm run paths:local`
- `npm test`

## Running Locally

1. Build the repo.
2. Import `apps/figma-plugin/manifest.json` as a local plugin in Figma.
3. Start the plugin in the target file.
4. Keep the bridge process running.
5. Verify with `figma.get_session_status`.

## Environment Variables

Bridge runtime:

- `FIGMA_AUTO_BRIDGE_HOST`
- `FIGMA_AUTO_BRIDGE_PORT`
- `FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL`
- `FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL`
- `FIGMA_AUTO_AUDIT_LOG_PATH`
- `FIGMA_AUTO_BRIDGE_LOG_PATH`

Plugin build:

- `FIGMA_AUTO_BRIDGE_WS_URL`
- `FIGMA_AUTO_BRIDGE_HTTP_URL`
- `FIGMA_AUTO_BRIDGE_PORT`
- `FIGMA_AUTO_FIGMA_PLUGIN_ID`

If you change plugin bridge URL settings, rebuild the plugin bundle.
For local plugin development, use `localhost` URLs, not `127.0.0.1`.
Figma rejects `devAllowedDomains` entries like `http://127.0.0.1:4318`, so the generated manifest should use `http://localhost:4318` and `ws://localhost:4318`.

## Logs

- bridge stdout: `logs/bridge.log`
- audit log: `logs/audit.ndjson`

## Troubleshooting

- `missing_session`
  Usually means the plugin is not running, could not connect, or was replaced by another plugin session.

- Wrong host or port
  Rebuild the plugin after changing bridge URL env vars. For local runs, prefer `localhost` over `127.0.0.1`.

- Mutating tool fails inside Figma
  Check `logs/bridge.log`, `logs/audit.ndjson`, and the plugin UI connection state.
