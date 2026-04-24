# Codex Private Build Guide

This guide is for the private OpenCode build that includes the native `codex`
provider. It covers building the local binary, installing it under a separate
command name, configuring a Codex-compatible API base, and running a smoke test.

## What This Build Adds

The private build adds a first-class `codex` provider. Use it when your API
provider expects Codex CLI-style Responses API requests instead of generic
OpenAI-compatible chat requests.

The provider sends requests to:

```txt
POST <baseURL>/responses
```

It also sends Codex compatibility headers and maps Codex tool calls back into
OpenCode's normal tool execution flow.

## Requirements

- macOS arm64 for the binary path used by these scripts.
- Bun 1.3 or newer.
- This repository checked out with the Codex provider patch applied.
- A Codex-compatible API key and base URL.

## Build

From the repository root:

```bash
./build.sh
```

The script runs the upstream OpenCode build with Bun `1.3.13` by default and
verifies this binary exists:

```txt
packages/opencode/dist/opencode-darwin-arm64/bin/opencode
```

To use a different Bun version:

```bash
BUN_VERSION=1.3.13 ./build.sh
```

You can also run the upstream build command directly:

```bash
bunx bun@1.3.13 run packages/opencode/script/build.ts
```

## Install

Install the private build as `opencode-codex`:

```bash
./install.sh
```

This creates a symlink in `~/.local/bin` by default:

```txt
~/.local/bin/opencode-codex -> packages/opencode/dist/opencode-darwin-arm64/bin/opencode
```

If `~/.local/bin` is not in your `PATH`, add it to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Install with a custom command name:

```bash
./install.sh --name opencode-private
```

Replace the normal `opencode` command with this private build:

```bash
./install.sh --replace
```

Use `--replace` only if you intentionally want this build to shadow any other
OpenCode installation in your `PATH`.

## Configure the Codex Provider

The provider id must be `codex`. The model selector should look like
`codex/<model>`, for example `codex/gpt-5.4`.

Create or update your OpenCode config at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "codex": {
      "name": "Codex",
      "env": ["CODEX_API_KEY"],
      "npm": "@opencode-ai/codex",
      "transport": "responses",
      "options": {
        "baseURL": "https://your-codex-gateway.example/v1"
      }
    }
  }
}
```

Important details:

- Set `baseURL` to the parent URL that has a `/responses` endpoint.
- Do not include `/responses` in `baseURL`; the provider appends it.
- Keep the provider id as `codex`; `other/gpt-5.4` or a custom provider id will
  not use the native Codex transport.
- `auth login` stores credentials in `~/.local/share/opencode/auth.json`, not in
  `opencode.json`.

## Add Auth

Option 1: use environment auth.

```bash
export CODEX_API_KEY="your-api-key"
```

Option 2: use OpenCode auth storage.

```bash
opencode-codex auth login
```

Select `Codex` and enter the API key. Then verify it appears:

```bash
opencode-codex auth list
```

## Run

Use the private build with a Codex model:

```bash
opencode-codex -m codex/gpt-5.4
```

For a non-interactive smoke test in a temporary directory:

```bash
tmp="$(mktemp -d /tmp/opencode-codex-XXXXXX)"
cd "$tmp"

cat > opencode.json <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "apply_patch": "allow",
    "edit": "allow",
    "write": "allow",
    "bash": "allow"
  }
}
JSON

opencode-codex run --pure --model codex/gpt-5.4 --dangerously-skip-permissions \
  'write a hello world python script to hello.py'

test -s hello.py
cat hello.py
```

The test passes if `hello.py` exists and is not empty.

## Troubleshooting

If `codex/gpt-5.4` says no auth is available:

- Confirm the model starts with `codex/`.
- Confirm `CODEX_API_KEY` is exported or `opencode-codex auth list` shows a
  `Codex` credential.
- Confirm you are running the private binary with `opencode-codex --version`.

If requests hit the wrong endpoint:

- Confirm `provider.codex.options.baseURL` is set in
  `~/.config/opencode/opencode.json`.
- Confirm the configured URL does not already end in `/responses`.
- Confirm `transport` is `responses`.

If the model replies with code text but does not write files:

- Check local permission rules. A global rule denying `apply_patch` can prevent
  file creation.
- Retry with `--pure` and a local `opencode.json` that allows `apply_patch`.
- Use `--dangerously-skip-permissions` only in a disposable test directory.

If the binary is missing:

- Run `./build.sh` again from the repository root.
- Confirm you are on macOS arm64 when using this guide's default binary path.
- Check that `packages/opencode/dist/opencode-darwin-arm64/bin/opencode` is
  executable.
