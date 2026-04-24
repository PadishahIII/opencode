import type { JSONSchema7, LanguageModelV3CallOptions, SharedV3Warning } from "@ai-sdk/provider"
import type { CodexTool } from "./codex-api-types"

const APPLY_PATCH_DESCRIPTION =
  "Use the `apply_patch` tool to edit files. This is a FREEFORM tool, so do not wrap the patch in JSON."

const APPLY_PATCH_LARK_GRAMMAR = `start: begin_patch hunk+ end_patch
begin_patch: "*** Begin Patch" LF
end_patch: "*** End Patch" LF?

hunk: add_hunk | delete_hunk | update_hunk
add_hunk: "*** Add File: " filename LF add_line+
delete_hunk: "*** Delete File: " filename LF
update_hunk: "*** Update File: " filename LF change_move? change?

filename: /(.+)/
add_line: "+" /(.*)/ LF -> line

change_move: "*** Move to: " filename LF
change: (change_context | change_line)+ eof_line?
change_context: ("@@" | "@@ " /(.+)/) LF
change_line: ("+" | "-" | " ") /(.*)/ LF
eof_line: "*** End of File" LF

%import common.LF`

function addApplyPatchTool(tools: CodexTool[]) {
  tools.push({
    type: "custom",
    name: "apply_patch",
    description: APPLY_PATCH_DESCRIPTION,
    format: { type: "grammar", syntax: "lark", definition: APPLY_PATCH_LARK_GRAMMAR },
  })
}

function codexFunctionParameters(item: Extract<NonNullable<LanguageModelV3CallOptions["tools"]>[number], { type: "function" }>) {
  const schema = item.inputSchema as JSONSchema7 & { jsonSchema?: JSONSchema7 }
  return schema.jsonSchema ?? schema ?? { type: "object", properties: {} }
}

export function convertCodexTools(options: Pick<LanguageModelV3CallOptions, "tools" | "toolChoice">) {
  const warnings: SharedV3Warning[] = []
  const tools: CodexTool[] = []
  let hasLocalShell = false

  function addLocalShell() {
    if (hasLocalShell) return
    hasLocalShell = true
    tools.push({ type: "local_shell" })
  }

  for (const item of options.tools ?? []) {
    if (item.type === "function" && item.name === "bash") {
      // Some Codex-compatible gateways reject the native `local_shell` tool
      // type. OpenCode's own bash executor is a normal function tool, so keep
      // it available in the portable JSON-schema form.
    }
    else if (item.type === "function" && item.name === "apply_patch") {
      addApplyPatchTool(tools)
      continue
    }
    if (item.type === "function") {
      tools.push({
        type: "function",
        name: item.name,
        description: item.description,
        parameters: codexFunctionParameters(item),
        strict: false,
      })
      continue
    }
    if (item.type === "provider" && item.id === "openai.local_shell") {
      addLocalShell()
      continue
    }
    if (item.type === "provider" && item.id === "openai.apply_patch") {
      addApplyPatchTool(tools)
      continue
    }
    warnings.push({ type: "unsupported", feature: `codex provider tool ${item.type}` })
  }

  const toolChoice = options.toolChoice?.type === "none" ? "none" : options.toolChoice?.type === "required" ? "required" : "auto"
  return { tools: tools.length ? tools : undefined, toolChoice, warnings }
}
