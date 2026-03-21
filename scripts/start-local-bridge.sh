#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
root_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
logs_dir="$root_dir/logs"
plugin_root="$root_dir/apps/figma-plugin"
bridge_entry_path="$root_dir/apps/mcp-bridge/dist/index.js"
protocol_messages_path="$root_dir/packages/protocol/src/messages.ts"

print_config_only=0
skip_build=0
requested_instance="${FIGMA_AUTO_LOCAL_INSTANCE:-}"
requested_port="${FIGMA_AUTO_BRIDGE_PORT:-}"

resolve_default_bridge_port() {
  port=$(sed -n 's/^export const BRIDGE_PORT = \([0-9][0-9]*\);$/\1/p' "$protocol_messages_path" | head -n 1)
  if [ -z "$port" ]; then
    printf 'Unable to resolve BRIDGE_PORT from %s\n' "$protocol_messages_path" >&2
    exit 1
  fi

  printf '%s\n' "$port"
}

resolve_instance_name() {
  python3 - "$1" <<'PY'
import re
import sys

value = sys.argv[1].strip().lower()
value = re.sub(r"[^a-z0-9._-]+", "-", value)
print(value.strip("-"))
PY
}

derive_instance_port() {
  python3 - "$1" "$2" <<'PY'
import sys

default_port = int(sys.argv[1])
name = sys.argv[2]
hash_value = 0
for character in name:
    hash_value = (hash_value * 31 + ord(character)) % 1000
print(default_port + 1 + hash_value)
PY
}

resolve_plugin_paths() {
  if [ -z "$1" ]; then
    printf '%s\n%s\n' "$plugin_root/manifest.json" "$plugin_root/dist"
    return
  fi

  instance_root="$plugin_root/instances/$1"
  printf '%s\n%s\n' "$instance_root/manifest.json" "$instance_root/dist"
}

for arg in "$@"; do
  case "$arg" in
    --print-config)
      print_config_only=1
      ;;
    --skip-build)
      skip_build=1
      ;;
    --instance=*)
      requested_instance=${arg#--instance=}
      ;;
    --port=*)
      requested_port=${arg#--port=}
      ;;
  esac
done

while [ "$#" -gt 0 ]; do
  arg="$1"
  case "$arg" in
    --print-config|--skip-build)
      shift
      ;;
    --instance)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --instance\n' >&2
        exit 1
      fi
      requested_instance="$1"
      shift
      ;;
    --port)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --port\n' >&2
        exit 1
      fi
      requested_port="$1"
      shift
      ;;
    --instance=*|--port=*)
      shift
      ;;
    *)
      printf 'Unknown argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

default_bridge_port=$(resolve_default_bridge_port)
instance_name=$(resolve_instance_name "$requested_instance")
if [ -n "$requested_port" ]; then
  bridge_port="$requested_port"
elif [ -n "$instance_name" ]; then
  bridge_port=$(derive_instance_port "$default_bridge_port" "$instance_name")
else
  bridge_port="$default_bridge_port"
fi
bridge_host="${FIGMA_AUTO_BRIDGE_HOST:-localhost}"
bridge_ws_url="${FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL:-ws://$bridge_host:$bridge_port}"
bridge_http_url="${FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL:-$(printf '%s' "$bridge_ws_url" | sed 's#^ws:#http:#; s#^wss:#https:#')}"
plugin_paths=$(resolve_plugin_paths "$instance_name")
manifest_path=$(printf '%s' "$plugin_paths" | sed -n '1p')
plugin_dist_dir=$(printf '%s' "$plugin_paths" | sed -n '2p')
instance_log_dir="$logs_dir"
if [ -n "$instance_name" ]; then
  instance_log_dir="$logs_dir/$instance_name"
fi
bridge_log_path="${FIGMA_AUTO_BRIDGE_LOG_PATH:-$instance_log_dir/bridge.log}"
audit_log_path="${FIGMA_AUTO_AUDIT_LOG_PATH:-$instance_log_dir/audit.ndjson}"

format_path() {
  python3 - "$root_dir" "$1" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()

try:
    rel = target.relative_to(root)
    print("." if str(rel) == "." else rel.as_posix())
except ValueError:
    print(target.as_posix())
PY
}

print_config() {
  printf 'Local Figma bridge config:\n'
  printf -- '- instance: %s\n' "${instance_name:-default}"
  printf -- '- manifest: %s\n' "$(format_path "$manifest_path")"
  printf -- '- plugin dist: %s\n' "$(format_path "$plugin_dist_dir")"
  printf -- '- bridge entry: %s\n' "$(format_path "$bridge_entry_path")"
  printf -- '- bridge stdout log: %s\n' "$(format_path "$bridge_log_path")"
  printf -- '- audit log: %s\n' "$(format_path "$audit_log_path")"
  printf -- '- websocket url: %s\n' "$bridge_ws_url"
  printf -- '- http url: %s\n' "$bridge_http_url"
  printf -- '- mcp endpoint: %s\n' "${bridge_http_url%/}/mcp"
}

cleanup() {
  status=$?
  trap - INT TERM EXIT

  if [ "${bridge_pid:-}" ]; then
    kill "$bridge_pid" 2>/dev/null || true
    wait "$bridge_pid" 2>/dev/null || true
  fi

  if [ "${tee_pid:-}" ]; then
    kill "$tee_pid" 2>/dev/null || true
    wait "$tee_pid" 2>/dev/null || true
  fi

  if [ "${log_pipe:-}" ] && [ -p "$log_pipe" ]; then
    rm -f "$log_pipe"
  fi

  exit "$status"
}

mkdir -p "$instance_log_dir"
print_config

if [ "$print_config_only" -eq 1 ]; then
  exit 0
fi

if [ "$skip_build" -ne 1 ]; then
  printf '\nBuilding plugin and bridge...\n'
  (
    cd "$root_dir"
    FIGMA_AUTO_LOCAL_INSTANCE="$instance_name" \
    FIGMA_AUTO_BRIDGE_PORT="$bridge_port" \
    FIGMA_AUTO_BRIDGE_WS_URL="$bridge_ws_url" \
    FIGMA_AUTO_BRIDGE_HTTP_URL="$bridge_http_url" \
    npm run build
  )
fi

printf '\nStarting local MCP bridge...\n'
printf 'Press Ctrl+C to stop.\n\n'

log_pipe="$instance_log_dir/.bridge.log.pipe.$$"
rm -f "$log_pipe"
mkfifo "$log_pipe"

trap cleanup INT TERM EXIT

tee -a "$bridge_log_path" < "$log_pipe" &
tee_pid=$!

(
  cd "$root_dir"
  FIGMA_AUTO_LOCAL_INSTANCE="$instance_name" \
  FIGMA_AUTO_BRIDGE_PORT="$bridge_port" \
  FIGMA_AUTO_BRIDGE_HOST="$bridge_host" \
  FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL="$bridge_ws_url" \
  FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL="$bridge_http_url" \
  FIGMA_AUTO_AUDIT_LOG_PATH="$audit_log_path" \
  node "$bridge_entry_path"
) > "$log_pipe" 2>&1 &
bridge_pid=$!

wait "$bridge_pid"
bridge_status=$?

wait "$tee_pid" 2>/dev/null || true
rm -f "$log_pipe"
trap - INT TERM EXIT

exit "$bridge_status"
