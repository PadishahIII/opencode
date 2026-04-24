#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$SCRIPT_DIR/packages/opencode/dist/opencode-darwin-arm64/bin/opencode"

usage() {
  cat <<'EOF'
Usage: ./build.sh

Builds the local OpenCode Darwin arm64 binary at:
  packages/opencode/dist/opencode-darwin-arm64/bin/opencode

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
bunx "bun@$BUN_VERSION" run packages/opencode/script/build.ts

if [[ ! -x "$BIN" ]]; then
  echo "error: expected binary was not created or is not executable:" >&2
  echo "  $BIN" >&2
  exit 1
fi

echo "Built binary: $BIN"
"$BIN" --version
