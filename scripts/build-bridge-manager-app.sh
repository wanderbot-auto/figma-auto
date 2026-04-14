#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
root_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)

package_path="$root_dir/apps/bridge-manager-macos"
product_name="FigmaAutoBridgeMenu"
app_name="$product_name.app"
configuration="release"
target_arch="universal"
bundle_id="com.figmaauto.bridge-manager"
version="1.0.0"
build_number="1"
minimum_system_version="13.0"
output_dir="$root_dir/dist"
sign_mode="ad-hoc"
sign_identity="-"
module_cache_root="$package_path/.build/module-cache"
clang_module_cache_root="$package_path/.build/clang-module-cache"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Build the Swift menu bar app and package it as a macOS .app bundle.

Options:
  --debug                 Build a debug bundle instead of release
  --arch VALUE            Target architecture: arm64, x86_64, or universal
  --output-dir PATH       Output directory for the generated .app
  --bundle-id ID          CFBundleIdentifier value
  --version VALUE         CFBundleShortVersionString value
  --build-number VALUE    CFBundleVersion value
  --sign IDENTITY         Codesign with a specific identity
  --no-sign               Skip codesign
  --help                  Show this help text
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --debug)
      configuration="debug"
      ;;
    --output-dir)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --output-dir\n' >&2
        exit 1
      fi
      output_dir="$1"
      ;;
    --arch)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --arch\n' >&2
        exit 1
      fi
      target_arch="$1"
      ;;
    --bundle-id)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --bundle-id\n' >&2
        exit 1
      fi
      bundle_id="$1"
      ;;
    --version)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --version\n' >&2
        exit 1
      fi
      version="$1"
      ;;
    --build-number)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --build-number\n' >&2
        exit 1
      fi
      build_number="$1"
      ;;
    --sign)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --sign\n' >&2
        exit 1
      fi
      sign_mode="identity"
      sign_identity="$1"
      ;;
    --no-sign)
      sign_mode="skip"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

case "$target_arch" in
  arm64|x86_64|universal)
    ;;
  *)
    printf 'Unsupported architecture: %s\n' "$target_arch" >&2
    usage >&2
    exit 1
    ;;
esac

build_for_arch() {
  arch="$1"
  arch_module_cache_dir="$module_cache_root/$arch"
  arch_clang_module_cache_dir="$clang_module_cache_root/$arch"

  printf 'Building %s (%s, %s)...\n' "$product_name" "$configuration" "$arch" >&2
  mkdir -p "$arch_module_cache_dir" "$arch_clang_module_cache_dir"
  SWIFTPM_MODULECACHE_OVERRIDE="$arch_module_cache_dir" \
  CLANG_MODULE_CACHE_PATH="$arch_clang_module_cache_dir" \
    swift build --package-path "$package_path" -c "$configuration" --arch "$arch" >&2
  SWIFTPM_MODULECACHE_OVERRIDE="$arch_module_cache_dir" \
  CLANG_MODULE_CACHE_PATH="$arch_clang_module_cache_dir" \
    swift build --package-path "$package_path" -c "$configuration" --arch "$arch" --show-bin-path
}

app_path="$output_dir/$app_name"
contents_path="$app_path/Contents"
macos_path="$contents_path/MacOS"
resources_path="$contents_path/Resources"
plist_path="$contents_path/Info.plist"

case "$target_arch" in
  universal)
    arm64_bin_dir=$(build_for_arch arm64)
    x86_64_bin_dir=$(build_for_arch x86_64)
    arm64_binary_path="$arm64_bin_dir/$product_name"
    x86_64_binary_path="$x86_64_bin_dir/$product_name"
    for binary_path in "$arm64_binary_path" "$x86_64_binary_path"; do
      if [ ! -x "$binary_path" ]; then
        printf 'Built binary not found at %s\n' "$binary_path" >&2
        exit 1
      fi
    done
    ;;
  *)
    bin_dir=$(build_for_arch "$target_arch")
    binary_path="$bin_dir/$product_name"
    if [ ! -x "$binary_path" ]; then
      printf 'Built binary not found at %s\n' "$binary_path" >&2
      exit 1
    fi
    ;;
esac

rm -rf "$app_path"
mkdir -p "$macos_path" "$resources_path"

case "$target_arch" in
  universal)
    lipo -create \
      "$arm64_binary_path" \
      "$x86_64_binary_path" \
      -output "$macos_path/$product_name"
    ;;
  *)
    cp "$binary_path" "$macos_path/$product_name"
    ;;
esac

cat > "$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>$product_name</string>
  <key>CFBundleIdentifier</key>
  <string>$bundle_id</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleDisplayName</key>
  <string>$product_name</string>
  <key>CFBundleName</key>
  <string>$product_name</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$version</string>
  <key>CFBundleVersion</key>
  <string>$build_number</string>
  <key>LSMinimumSystemVersion</key>
  <string>$minimum_system_version</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
EOF

if command -v plutil >/dev/null 2>&1; then
  plutil -lint "$plist_path" >/dev/null
fi

case "$sign_mode" in
  ad-hoc)
    printf 'Codesigning bundle with ad-hoc identity...\n'
    codesign --force --deep -s - "$app_path"
    ;;
  identity)
    printf 'Codesigning bundle with identity: %s\n' "$sign_identity"
    codesign --force --deep -s "$sign_identity" "$app_path"
    ;;
  skip)
    printf 'Skipping codesign.\n'
    ;;
esac

if command -v lipo >/dev/null 2>&1; then
  printf 'Binary architectures: %s\n' "$(lipo -info "$macos_path/$product_name")"
fi

printf 'Created app bundle: %s\n' "$app_path"
