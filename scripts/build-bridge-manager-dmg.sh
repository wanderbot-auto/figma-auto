#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
root_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)

product_name="FigmaAutoBridgeMenu"
version="1.0.0"
output_dir="$root_dir/dist"
volume_name="$product_name"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [-- <app-build-options>]

Build the macOS app bundle and package it as a .dmg disk image.

Options:
  --output-dir PATH       Output directory for the generated .dmg
  --volume-name NAME      Volume name shown when mounting the disk image
  --version VALUE         Version suffix used in the dmg filename
  --help                  Show this help text

Any arguments after -- are forwarded to build-bridge-manager-app.sh.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-dir)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --output-dir\n' >&2
        exit 1
      fi
      output_dir="$1"
      ;;
    --volume-name)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --volume-name\n' >&2
        exit 1
      fi
      volume_name="$1"
      ;;
    --version)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --version\n' >&2
        exit 1
      fi
      version="$1"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if ! command -v hdiutil >/dev/null 2>&1; then
  printf 'hdiutil is required to build a dmg on macOS.\n' >&2
  exit 1
fi

mkdir -p "$output_dir"

printf 'Building app bundle for dmg packaging...\n'
"$script_dir/build-bridge-manager-app.sh" --output-dir "$output_dir" "$@"

app_path="$output_dir/$product_name.app"
dmg_name="$product_name-$version.dmg"
dmg_path="$output_dir/$dmg_name"
staging_dir=$(mktemp -d "$output_dir/.dmg-staging.XXXXXX")

cleanup() {
  rm -rf "$staging_dir"
}
trap cleanup EXIT INT TERM

if [ ! -d "$app_path" ]; then
  printf 'App bundle not found at %s\n' "$app_path" >&2
  exit 1
fi

cp -R "$app_path" "$staging_dir/$product_name.app"
ln -s /Applications "$staging_dir/Applications"
rm -f "$dmg_path"

printf 'Creating dmg: %s\n' "$dmg_path"
hdiutil create \
  -volname "$volume_name" \
  -srcfolder "$staging_dir" \
  -format UDZO \
  -imagekey zlib-level=9 \
  "$dmg_path" >/dev/null

printf 'Created dmg: %s\n' "$dmg_path"
