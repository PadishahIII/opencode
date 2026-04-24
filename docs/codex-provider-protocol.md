# Codex Provider Protocol Notes

This document records the native OpenCode `codex` provider protocol and the
Codex CLI behavior it mirrors for custom API bases.

## Codex CLI Reference Points

The local Codex checkout was used as the compatibility reference:

- `codex/codex-rs/model-provider-info/src/lib.rs` defines model providers as
  Responses API providers.
- `codex/codex-rs/codex-api/src/provider.rs` composes provider base URLs.
- `codex/codex-rs/codex-api/src/endpoint/responses.rs` sends
  `POST <base>/responses` over SSE.
- `codex/codex-rs/codex-api/src/common.rs` defines request fields such as
  `instructions`, `input`, `tools`, `reasoning`, `text`, and
  `client_metadata`.
- `codex/codex-rs/core/src/client.rs` adds Codex compatibility headers such as
  `x-client-request-id`, `x-codex-window-id`, and installation metadata.

## OpenCode Native Provider

OpenCode now treats `codex` as a first-class provider id and routes live calls
through a dedicated SDK instead of generic `@ai-sdk/openai` normalization.

Relevant files:

- `packages/opencode/src/provider/sdk/codex/index.ts`
- `packages/opencode/src/provider/sdk/codex/codex-language-model.ts`
- `packages/opencode/src/provider/sdk/codex/codex-convert-input.ts`
- `packages/opencode/src/provider/sdk/codex/codex-convert-tools.ts`
- `packages/opencode/src/provider/sdk/codex/codex-stream-parser.ts`
- `packages/opencode/src/provider/provider.ts`
- `packages/opencode/src/session/llm.ts`

Provider config should use:

```json
{
  "provider": {
    "codex": {
      "name": "Codex",
      "env": ["CODEX_API_KEY"],
      "npm": "@opencode-ai/codex",
      "transport": "responses",
      "options": {
        "baseURL": "https://your-codex-gateway.example/codex/v1"
      }
    }
  }
}
```

`auth login` stores the API key in OpenCode's auth store under provider id
`codex`; it does not write the key into `opencode.json`.

## Request Contract

The native SDK sends:

- Endpoint: `POST <baseURL>/responses`
- Auth: `Authorization: Bearer <key>` from `auth.json`, `CODEX_API_KEY`, or
  provider `options.apiKey`
- Required headers: `Accept: text/event-stream`, `Content-Type:
  application/json`
- Compatibility headers: `x-client-request-id`, `x-codex-window-id`,
  `x-codex-installation-id`, and optional `ChatGPT-Account-ID`

The request body uses top-level Responses fields:

- `model`
- `instructions`
- `input`
- `tools`
- `tool_choice`
- `parallel_tool_calls`
- `reasoning`
- `store`
- `stream`
- `prompt_cache_key`
- `text`
- `client_metadata`

OpenCode system prompt content is sent as top-level `instructions`; it is not
encoded as a synthetic `system` or `developer` item inside `input`.

## Tool Contract

Phase 1 native tool parity supports the tools needed for file-writing agent
flows:

- `bash` maps to Codex `local_shell` request tools and returns through the
  existing OpenCode bash tool executor.
- `apply_patch` maps to a Codex function tool and returns through the existing
  OpenCode apply-patch executor.
- Existing OpenCode function tools remain available as generic function tools
  when their schemas are JSON-compatible.

The previous text-output file fallback is not part of the native provider. File
creation must come from a real tool call and tool result.

## Stream Contract

The native parser handles the Responses SSE events required by OpenCode's V3
language model stream:

- `response.created`
- `response.output_item.added`
- `response.output_text.delta`
- `response.reasoning_summary_text.delta`
- `response.output_item.done`
- `response.completed`
- `response.failed`
- `error`

Tool items produce `tool-input-start`, `tool-input-end`, and `tool-call` stream
parts so OpenCode's normal processor creates and completes stored tool parts.

## Debugging Checklist

When `codex/<model>` fails against a gateway:

1. Confirm the selected model starts with provider id `codex/`, not a custom id
   such as `internalcodex/`.
2. Confirm `provider.codex.options.baseURL` points at the parent path whose
   `/responses` child exists.
3. Confirm auth resolves for provider id `codex` with `opencode auth list` or
   `CODEX_API_KEY`.
4. Confirm the gateway accepts Codex compatibility headers and top-level
   `instructions`.
5. If a file is not created, inspect the stream for a real `function_call`,
   `apply_patch_call`, or `local_shell_call` item.
