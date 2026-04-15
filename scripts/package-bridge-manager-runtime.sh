#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
root_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s <runtime-output-dir>\n' "$(basename "$0")" >&2
  exit 1
fi

runtime_dir="$1"

if [ ! -d "$root_dir/node_modules" ]; then
  printf 'node_modules is missing. Run npm install before packaging the bridge manager runtime.\n' >&2
  exit 1
fi

build_product_instance() {
  instance_slug="$1"
  bridge_port=$(node -e 'const defaultPort=4318; const slug=process.argv[1]; let hash=0; for (const ch of slug) { hash = (hash * 31 + ch.charCodeAt(0)) % 1000; } process.stdout.write(String(defaultPort + 1 + hash));' "$instance_slug")
  bridge_http_url="http://localhost:$bridge_port"
  bridge_ws_url="ws://localhost:$bridge_port"

  printf 'Building bundled plugin instance: %s (%s)\n' "$instance_slug" "$bridge_http_url"
  (
    cd "$root_dir" && \
    FIGMA_AUTO_LOCAL_INSTANCE="$instance_slug" \
    FIGMA_AUTO_BRIDGE_PORT="$bridge_port" \
    FIGMA_AUTO_BRIDGE_HTTP_URL="$bridge_http_url" \
    FIGMA_AUTO_BRIDGE_WS_URL="$bridge_ws_url" \
    npm run build -w @figma-auto/figma-plugin
  )
}

for instance_slug in marketing-landing product-flow design-system; do
  build_product_instance "$instance_slug"
done

required_paths="
apps/mcp-bridge/dist/index.js
apps/figma-plugin/instances
packages/protocol/src/messages.ts
"

for relative_path in $required_paths; do
  if [ ! -e "$root_dir/$relative_path" ]; then
    printf 'Missing required runtime asset: %s\n' "$root_dir/$relative_path" >&2
    printf 'Run npm run build before packaging the bridge manager runtime.\n' >&2
    exit 1
  fi
done

rm -rf "$runtime_dir"
mkdir -p "$runtime_dir/apps" "$runtime_dir/packages"

cp "$root_dir/package.json" "$runtime_dir/package.json"

mkdir -p "$runtime_dir/apps/mcp-bridge"
cp -R "$root_dir/apps/mcp-bridge/dist" "$runtime_dir/apps/mcp-bridge/dist"

mkdir -p "$runtime_dir/apps/figma-plugin"
cp -R "$root_dir/apps/figma-plugin/instances" "$runtime_dir/apps/figma-plugin/instances"

if [ -d "$root_dir/apps/figma-plugin/dist" ]; then
  cp -R "$root_dir/apps/figma-plugin/dist" "$runtime_dir/apps/figma-plugin/dist"
fi
if [ -f "$root_dir/apps/figma-plugin/manifest.json" ]; then
  cp "$root_dir/apps/figma-plugin/manifest.json" "$runtime_dir/apps/figma-plugin/manifest.json"
fi

mkdir -p "$runtime_dir/packages/protocol/src"
cp "$root_dir/packages/protocol/src/messages.ts" "$runtime_dir/packages/protocol/src/messages.ts"

printf 'Copying Node.js dependencies into bundled runtime...\n'
rsync -aL --delete "$root_dir/node_modules/" "$runtime_dir/node_modules/"

printf 'Bundled runtime prepared at %s\n' "$runtime_dir"
