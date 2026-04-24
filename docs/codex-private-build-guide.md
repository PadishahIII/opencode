# Codex Private Build Guide

This private OpenCode build adds a native `codex` provider for Codex-compatible
Responses API gateways.

## Features

- Adds `codex` as a first-class provider id.
- Supports model selection like `codex/gpt-5.4`.
- Sends Codex-style requests to `POST <baseURL>/responses`.
- Sends Codex compatibility headers such as `x-client-request-id`,
  `x-codex-window-id`, and installation metadata.
- Maps Codex tool calls back into OpenCode's normal tool execution flow.
- Sends OpenCode, plugin, and MCP function tools to Codex-compatible gateways as
  portable JSON-schema function tools.
- Keeps Claude/OmO/Superpowers skills discoverable from `~/.claude/skills` and
  `~/.agents/skills`.
- Lets you configure a private Codex-compatible API base without a MITM proxy.

## Configure

The provider id must be `codex`. A custom provider id such as `other` or
`internalcodex` will not use the native Codex transport.

Create or update your OpenCode config at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "codex": {
      "name": "Codex",
      "env": ["CODEX_API_KEY"],
      "npm": "@opencode-ai/codex",
      "options": {
        "baseURL": "https://your-codex-gateway.example/v1"
      }
    }
  }
}
```

Rules:

- Set `baseURL` to the parent URL that has a `/responses` endpoint.
- Do not include `/responses` in `baseURL`; the provider appends it.
- Use models as `codex/<model>`, for example `codex/gpt-5.4`.
- `auth login` stores credentials in `~/.local/share/opencode/auth.json`, not in
  `opencode.json`.

## Skills and Tools

`opencode-codex` should expose the same user skill trees as normal OpenCode:

- `~/.claude/skills/**/SKILL.md`
- `~/.agents/skills/**/SKILL.md`
- project `.claude/skills/**/SKILL.md`
- project `.agents/skills/**/SKILL.md`
- configured `skills.paths`
- configured `skills.urls`

Nested skills such as `~/.claude/skills/Utilities/Documents/SKILL.md` are
supported. Setting `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1` disables only the
Claude Code compatibility skill behavior; it does not hide OmO/Superpowers skill
trees. Set `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` only when you intentionally want
to disable all external `.claude` and `.agents` skill discovery.

Codex provider tool behavior:

- `apply_patch` is declared as a Codex custom grammar tool.
- OpenCode `bash` is declared as a portable JSON-schema function tool instead
  of native Codex `local_shell`, because this private gateway rejects native
  `local_shell`.
- OpenCode built-in tools, plugin tools, and MCP tools are declared as generic
  Codex function tools when they have JSON-schema input.

This is first-class OpenCode provider behavior for this private gateway, but it
is still Codex-compatible gateway mode rather than exact upstream Codex CLI wire
parity for shell execution.

## Auth

Use environment auth:

```bash
export CODEX_API_KEY="your-api-key"
```

Or use OpenCode auth storage:

```bash
opencode-codex auth login
opencode-codex auth list
```

Select `Codex` when prompted.

## Build and Install

Requirements:

- macOS arm64 for the binary path used by these scripts.
- Bun 1.3 or newer.
- This repository checked out with the Codex provider patch applied.

Build from the repository root:

```bash
./build.sh
```

This creates and verifies:

```txt
packages/opencode/dist/opencode-darwin-arm64/bin/opencode
```

Install as `opencode-codex`:

```bash
./install.sh
```

Install with another command name:

```bash
./install.sh --name opencode-private
```

Replace the normal `opencode` command with this private build:

```bash
./install.sh --replace
```

If `~/.local/bin` is not in `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Use

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

If the model replies with code text but does not write files:

- Check local permission rules. A global rule denying `apply_patch` can prevent
  file creation.
- Retry with `--pure` and a local `opencode.json` that allows `apply_patch`.
- Use `--dangerously-skip-permissions` only in a disposable test directory.

If a skill such as `Documents` is missing:

- Confirm the skill file has frontmatter with a `name` matching the name you ask
  the `skill` tool to load. Skill names are case-sensitive.
- Confirm the skill lives under one of the scanned trees, for example
  `~/.claude/skills/Utilities/Documents/SKILL.md`.
- Confirm `OPENCODE_DISABLE_EXTERNAL_SKILLS` is not set.
- Run the same `opencode-codex` binary you installed with `./install.sh`; stale
  binaries may not include the private skill-discovery behavior.
- Add an explicit config path if needed:

  ```json
  {
    "$schema": "https://opencode.ai/config.json",
    "skills": {
      "paths": ["~/.claude/skills", "~/.agents/skills"]
    }
  }
  ```

If the binary is missing:

- Run `./build.sh` again from the repository root.
- Confirm you are on macOS arm64 when using this guide's default binary path.
- Check that `packages/opencode/dist/opencode-darwin-arm64/bin/opencode` is
  executable.
