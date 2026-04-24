Title: [FEATURE]: add native Codex provider support

## Feature hasn't been suggested before

- [x] I have verified this feature I'm about to request hasn't been suggested before.

## Describe the enhancement you want to request

I would like OpenCode to support `codex` as a first-class provider for Codex-compatible Responses API endpoints.

OpenCode already supports many providers through `models.dev` and generic SDK adapters. In this case, a `models.dev` entry alone is not enough because Codex-compatible gateways expect Codex CLI-style request construction, not only a model list:

- `POST <baseURL>/responses`
- top-level `instructions` and Responses API `input`
- `store: false` by default
- Codex compatibility headers such as `x-client-request-id`, `x-codex-window-id`, and installation metadata
- Codex tool formats, especially `apply_patch` as a Responses API custom grammar tool

The goal is to let users configure a Codex-compatible API base and use models like:

```bash
opencode -m codex/gpt-5.4
```

without relying on provider-specific proxy hacks or MITM rewriting.

Proposed scope:

- Add `codex` as a provider id available in auth/config flows.
- Route `codex/*` models through a native Responses API transport.
- Preserve configurable `baseURL` and API-key auth for user-specified Codex-compatible providers.
- Translate OpenCode messages and tool calls to the Codex-compatible Responses protocol.
- Add focused tests for provider loading, request construction, stream parsing, and tool-call handling.

I have a local proof of concept that keeps the change focused on provider integration and includes tests. If maintainers agree with this direction, I can open a PR linked to this issue.

Local verification used for the prototype:

```bash
bun test --timeout 120000 test/provider/codex-sdk.test.ts test/session/llm.test.ts test/provider/provider.test.ts test/provider/transform.test.ts test/cli/providers.test.ts
```

Result:

```text
241 pass
0 fail
```
