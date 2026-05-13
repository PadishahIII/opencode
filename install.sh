#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
NAME="opencode-codex"

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
Usage: ./install.sh [--replace] [--name NAME]

Installs the locally built OpenCode binary by symlinking it into ~/.local/bin.

Options:
  --replace       Install as "opencode" instead of "opencode-codex".
  --name NAME     Install using a custom command name.
  -h, --help      Show this help.

Environment:
  INSTALL_DIR     Override install directory. Default: ~/.local/bin
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --replace)
      NAME="opencode"
      shift
      ;;
    --name)
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "error: --name requires a value" >&2
        exit 2
      fi
      NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -x "$BIN" ]]; then
  echo "error: built binary not found or not executable:" >&2
  echo "  $BIN" >&2
  echo "build it first with:" >&2
  echo "  bunx bun@1.3.11 run packages/opencode/script/build.ts" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
ln -sf "$BIN" "$INSTALL_DIR/$NAME"

echo "Installed $NAME -> $BIN"

if ! command -v "$NAME" >/dev/null 2>&1; then
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
      echo
      echo "$INSTALL_DIR is not in PATH. Add this to your shell profile:"
      echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
      ;;
  esac
fi

"$INSTALL_DIR/$NAME" --version
