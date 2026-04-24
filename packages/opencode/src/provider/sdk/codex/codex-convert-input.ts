import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3ToolResultOutput,
  SharedV3Warning,
} from "@ai-sdk/provider"
import type { CodexInputItem } from "./codex-api-types"

function outputText(output: LanguageModelV3ToolResultOutput) {
  if (output.type === "text") return output.value
  if (output.type === "json") return JSON.stringify(output.value)
  if (output.type === "error-text") return output.value
  if (output.type === "error-json") return JSON.stringify(output.value)
  if (output.type === "execution-denied") return output.reason ?? "Execution denied"
  if (output.type === "content") {
    return output.value
      .map((item) => {
        if (item.type === "text") return item.text
        if (item.type === "file-url") return item.url
        if (item.type === "file-id") return typeof item.fileId === "string" ? item.fileId : JSON.stringify(item.fileId)
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  return JSON.stringify(output)
}

function parseShellCommand(input: unknown) {
  if (!input || typeof input !== "object") return ["sh", "-lc", ""]
  if ("command" in input && typeof input.command === "string") return ["sh", "-lc", input.command]
  if ("action" in input && input.action && typeof input.action === "object") {
    const action = input.action as Record<string, unknown>
    if (Array.isArray(action.command)) return action.command.map(String)
  }
  return ["sh", "-lc", JSON.stringify(input)]
}

export function convertCodexInput(options: Pick<LanguageModelV3CallOptions, "prompt">) {
  const warnings: SharedV3Warning[] = []
  const instructions: string[] = []
  const input: CodexInputItem[] = []

  for (const message of options.prompt as LanguageModelV3Prompt) {
    if (message.role === "system") {
      instructions.push(message.content)
      continue
    }

    if (message.role === "user") {
      input.push({
        role: "user",
        content: message.content.flatMap((part) => {
          if (part.type === "text") return [{ type: "input_text" as const, text: part.text }]
          warnings.push({ type: "unsupported", feature: `codex user ${part.type} part` })
          return []
        }),
      })
      continue
    }

    if (message.role === "assistant") {
      for (const part of message.content) {
        if (part.type === "text") {
          input.push({
            role: "assistant",
            content: [{ type: "output_text", text: part.text }],
            id: part.providerOptions?.codex?.itemId as string | undefined,
          })
          continue
        }
        if (part.type === "tool-call") {
          if (part.toolName === "apply_patch") {
            input.push({
              type: "custom_tool_call",
              call_id: part.toolCallId,
              name: "apply_patch",
              input: typeof part.input === "object" && part.input && "patchText" in part.input ? String(part.input.patchText) : JSON.stringify(part.input),
              id: part.providerOptions?.codex?.itemId as string | undefined,
            })
            continue
          }
          if (part.toolName === "bash" || part.toolName === "local_shell") {
            input.push({
              type: "local_shell_call",
              call_id: part.toolCallId,
              id: part.providerOptions?.codex?.itemId as string | undefined,
              action: { type: "exec", command: parseShellCommand(part.input) },
            })
            continue
          }
          input.push({
            type: "function_call",
            call_id: part.toolCallId,
            name: part.toolName,
            arguments: JSON.stringify(part.input),
            id: part.providerOptions?.codex?.itemId as string | undefined,
          })
          continue
        }
        if (part.type === "tool-result") {
          if (part.toolName === "apply_patch") {
            input.push({ type: "custom_tool_call_output", call_id: part.toolCallId, name: "apply_patch", output: outputText(part.output) })
            continue
          }
          input.push({ type: "function_call_output", call_id: part.toolCallId, output: outputText(part.output) })
        }
      }
      continue
    }

    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type !== "tool-result") continue
        const out = outputText(part.output)
        if (part.toolName === "bash" || part.toolName === "local_shell") {
          input.push({ type: "local_shell_call_output", call_id: part.toolCallId, output: out })
          continue
        }
        if (part.toolName === "apply_patch") {
          input.push({ type: "custom_tool_call_output", call_id: part.toolCallId, name: "apply_patch", output: out })
          continue
        }
        input.push({ type: "function_call_output", call_id: part.toolCallId, output: out })
      }
    }
  }

  return {
    instructions: instructions.join("\n") || undefined,
    input,
    warnings,
  }
}
