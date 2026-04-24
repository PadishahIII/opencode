# Lessons

## 2026-04-24 — OmO skill symlinks and opencode-codex smoke tests

- Context: While validating the private `opencode-codex` build, native OpenCode skill discovery could see skills like `Documents`, `writing-skills`, and `dispatching-parallel-agents`, but OmO's bundled compatibility `skill` tool still reported `Skill or command "... " not found` during `/init` in `/Volumes/T9/machines/Users/jasonharris/Documents/lichoin/code-audit`.
- Memory: There are two skill registries to consider. Native OpenCode uses `Skill.Service` and can be checked with `opencode-codex debug skill`; OmO's plugin has its own resolver and reliably scans top-level `~/.config/opencode/skills/*`. Use `$HOME`-portable relative symlinks under `~/.config/opencode/skills` to bridge nested Claude skills and packaged Superpowers skills into OmO's top-level resolver.
- Evidence:
  - Native check: `opencode-codex debug skill` found `Documents` at `/Users/jasonharris/.claude/skills/Utilities/Documents/SKILL.md` and Superpowers skills under `/Users/jasonharris/.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills/...`.
  - OmO error source was the plugin resolver in `/Users/jasonharris/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/dist/index.js`, which emits `Skill or command "... " not found`.
  - Portable symlink examples from `~/.config/opencode/skills`:
    - `Documents -> ../../../.claude/skills/Utilities/Documents`
    - `writing-skills -> ../../../.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills/writing-skills`
    - `dispatching-parallel-agents -> ../../../.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills/dispatching-parallel-agents`
  - After adding symlinks, `opencode-codex run --command init --model codex/gpt-5.4 --format json --dangerously-skip-permissions 'smoke test; do not edit files; just inspect setup enough to verify skill loading'` in `code-audit` produced `Skill or command: 0` and `not found: 0` in `/tmp/code-audit-init-smoke.jsonl`.
- Reuse: When a future `opencode-codex`/OmO session reports a skill missing but `debug skill` sees it, check whether the error string is OmO's `Skill or command` wording. If yes, verify or create `$HOME`-portable symlinks in `~/.config/opencode/skills`, then rerun a real `opencode-codex run --command init --format json` smoke and grep the JSONL for `"status":"error"`, `Skill or command`, and `not found`.

## 2026-04-24 — Testing a rebuilt opencode-codex binary

- Context: After changing the private Codex provider and skill discovery, the installed binary had to be tested rather than only source tests.
- Memory: Build with `./build.sh`, install with `./install.sh`, then test the installed command path and version before behavioral checks. Use disposable projects and fake local `/responses` servers to inspect actual Codex request bodies without depending on the real gateway.
- Evidence:
  - Build/install commands from repo root: `./build.sh` and `./install.sh`.
  - Binary check: `command -v opencode-codex && opencode-codex --version`.
  - Skill registry check: `opencode-codex debug skill > /tmp/opencode-codex-skills.json` and parse for expected skills.
  - External tool smoke pattern: create a disposable project with `.opencode/tools/external-mcp.ts`, configure `provider.codex.options.baseURL` to a local fake server, run `opencode-codex run --dir <tmp> --model codex/gpt-5.4 --format json --dangerously-skip-permissions 'reply ok'`, then assert the captured `/responses` body includes `{ "type": "function", "name": "external-mcp" }`.
- Reuse: For future private provider changes, require both package tests (`bun test ...`, `bun typecheck` from `packages/opencode`) and installed-binary smoke tests (`debug skill`, `/init` JSONL error grep, and local fake `/responses` request capture when tool serialization changes).
