#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux) OS="linux" ;;
  *)
    echo "error: unsupported operating system: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64) ARCH="x64" ;;
  *)
    echo "error: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

TARGET="opencode-$OS-$ARCH"
BIN="$SCRIPT_DIR/packages/opencode/dist/$TARGET/bin/opencode"

usage() {
  cat <<'EOF'
Usage: ./build.sh

Builds the local OpenCode binary for this platform at:
EOF
  cat <<EOF
  packages/opencode/dist/$TARGET/bin/opencode

Environment:
  BUN_VERSION    Bun version used via bunx. Default: 1.3.13
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  "") ;;
  *)
    echo "error: unknown argument: $1" >&2
    usage >&2
    exit 2
    ;;
esac

cd "$SCRIPT_DIR"

BUN_VERSION="${BUN_VERSION:-1.3.13}"

echo "Building OpenCode with bun@$BUN_VERSION..."
if [[ "$(bun --version)" == "$BUN_VERSION" ]]; then
  bun --bun run packages/opencode/script/build.ts --single --skip-install
else
  bunx "bun@$BUN_VERSION" --bun run packages/opencode/script/build.ts --single --skip-install
fi

if [[ ! -x "$BIN" ]]; then
  echo "error: expected binary was not created or is not executable:" >&2
  echo "  $BIN" >&2
  exit 1
fi

echo "Built binary: $BIN"
"$BIN" --version
