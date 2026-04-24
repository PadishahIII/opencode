import type { LanguageModelV3FinishReason, LanguageModelV3StreamPart, SharedV3Warning } from "@ai-sdk/provider"
import type { CodexResponseEvent } from "./codex-api-types"

type Usage = {
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
}

function usageOf(response: Record<string, any>): Usage {
  const usage = response.usage && typeof response.usage === "object" ? response.usage : {}
  return {
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
    cachedInputTokens:
      typeof usage.input_tokens_details?.cached_tokens === "number" ? usage.input_tokens_details.cached_tokens : undefined,
    reasoningTokens:
      typeof usage.output_tokens_details?.reasoning_tokens === "number"
        ? usage.output_tokens_details.reasoning_tokens
        : undefined,
  }
}

function normalizeApplyPatchInput(item: Record<string, any>) {
  if (typeof item.input === "string" && item.input) return JSON.stringify({ patchText: item.input })
  if (typeof item.arguments === "string" && item.arguments) return item.arguments
  if (item.operation) {
    const operation = item.operation as Record<string, string>
    if (operation.type === "delete_file") {
      return JSON.stringify({ patchText: `*** Begin Patch\n*** Delete File: ${operation.path}\n*** End Patch\n` })
    }
    if (operation.type === "create_file") {
      return JSON.stringify({
        patchText: `*** Begin Patch\n*** Add File: ${operation.path}\n${operation.diff ?? ""}\n*** End Patch\n`,
      })
    }
    if (operation.type === "update_file") {
      return JSON.stringify({
        patchText: `*** Begin Patch\n*** Update File: ${operation.path}\n${operation.diff ?? ""}\n*** End Patch\n`,
      })
    }
  }
  return "{}"
}

export function parseCodexStream(input: ReadableStream<CodexResponseEvent>, warnings: SharedV3Warning[]) {
  let responseId: string | null = null
  let currentTextId: string | null = null
  let currentReasoningId: string | null = null
  let finishReason: LanguageModelV3FinishReason = { unified: "other", raw: undefined }
  const usage: Usage = {}

  return input.pipeThrough(
    new TransformStream<CodexResponseEvent, LanguageModelV3StreamPart>({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings })
      },
      transform(value, controller) {
        const event = value as Record<string, any>
        if (event.type === "response.created") {
          responseId = event.response.id
          controller.enqueue({
            type: "response-metadata",
            id: event.response.id,
            timestamp: event.response.created_at ? new Date(event.response.created_at * 1000) : undefined,
            modelId: event.response.model,
          })
          return
        }

        if (event.type === "response.output_item.added" && event.item.type === "message") {
          const textId = String(event.item.id ?? `msg_${event.output_index}`)
          currentTextId = textId
          controller.enqueue({ type: "text-start", id: textId, providerMetadata: { codex: { itemId: textId } } })
          return
        }

        if (event.type === "response.output_text.delta") {
          const textId = currentTextId ?? String(event.item_id ?? "msg_0")
          currentTextId = textId
          controller.enqueue({ type: "text-delta", id: textId, delta: event.delta })
          return
        }

        if (event.type === "response.reasoning_summary_text.delta") {
          currentReasoningId ??= `${event.item_id ?? "reasoning"}:${event.summary_index ?? 0}`
          controller.enqueue({ type: "reasoning-delta", id: currentReasoningId, delta: event.delta })
          return
        }

        if (event.type === "response.output_item.added" && event.item.type === "reasoning") {
          currentReasoningId = `${event.item.id ?? `reasoning_${event.output_index}`}:0`
          controller.enqueue({
            type: "reasoning-start",
            id: currentReasoningId,
            providerMetadata: { codex: { itemId: event.item.id, encryptedContent: event.item.encrypted_content ?? null } },
          })
          return
        }

        if (event.type === "response.output_item.done") {
          if (event.item.type === "message" && currentTextId) {
            controller.enqueue({ type: "text-end", id: currentTextId })
            currentTextId = null
            return
          }
          if (event.item.type === "reasoning" && currentReasoningId) {
            controller.enqueue({ type: "reasoning-end", id: currentReasoningId })
            currentReasoningId = null
            return
          }
          if (event.item.type === "local_shell_call") {
            const callId = event.item.call_id ?? event.item.id
            controller.enqueue({ type: "tool-input-start", id: callId, toolName: "bash" })
            controller.enqueue({ type: "tool-input-end", id: callId })
            controller.enqueue({
              type: "tool-call",
              toolCallId: callId,
              toolName: "bash",
              input: JSON.stringify({
                command: Array.isArray(event.item.action?.command) ? event.item.action.command.join(" ") : "",
                timeout: event.item.action?.timeout_ms,
                workdir: event.item.action?.working_directory,
                description: "Run shell command",
              }),
              providerMetadata: { codex: { itemId: event.item.id, itemType: event.item.type, callId } },
            })
            finishReason = { unified: "tool-calls", raw: undefined }
            return
          }
          if (event.item.type === "function_call" || event.item.type === "apply_patch_call" || event.item.type === "custom_tool_call") {
            const callId = event.item.call_id ?? event.item.id
            controller.enqueue({ type: "tool-input-start", id: callId, toolName: event.item.name ?? "apply_patch" })
            controller.enqueue({ type: "tool-input-end", id: callId })
            controller.enqueue({
              type: "tool-call",
              toolCallId: callId,
              toolName: event.item.name ?? "apply_patch",
              input: event.item.type === "apply_patch_call" || event.item.type === "custom_tool_call" ? normalizeApplyPatchInput(event.item) : (event.item.arguments ?? "{}"),
              providerMetadata: { codex: { itemId: event.item.id, itemType: event.item.type, callId } },
            })
            finishReason = { unified: "tool-calls", raw: undefined }
            return
          }
        }

        if (event.type === "response.failed" || event.type === "error") {
          controller.enqueue({ type: "error", error: event.error ?? event.response })
          return
        }

        if (event.type === "response.completed") {
          Object.assign(usage, usageOf(event.response))
          if (finishReason.unified !== "tool-calls") finishReason = { unified: "stop", raw: undefined }
        }
      },
      flush(controller) {
        if (currentTextId) controller.enqueue({ type: "text-end", id: currentTextId })
        if (currentReasoningId) controller.enqueue({ type: "reasoning-end", id: currentReasoningId })
        controller.enqueue({
          type: "finish",
          finishReason,
          usage: {
            inputTokens: {
              total: usage.inputTokens,
              noCache:
                usage.inputTokens != null && usage.cachedInputTokens != null
                  ? usage.inputTokens - usage.cachedInputTokens
                  : undefined,
              cacheRead: usage.cachedInputTokens,
              cacheWrite: undefined,
            },
            outputTokens: { total: usage.outputTokens, text: undefined, reasoning: usage.reasoningTokens },
            raw: usage,
          },
          providerMetadata: { codex: { responseId } },
        })
      },
    }),
  )
}
