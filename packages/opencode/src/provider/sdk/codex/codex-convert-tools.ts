import type { LanguageModelV3CallOptions, SharedV3Warning } from "@ai-sdk/provider"
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

export function convertCodexTools(options: Pick<LanguageModelV3CallOptions, "tools" | "toolChoice">) {
  const warnings: SharedV3Warning[] = []
  const tools: CodexTool[] = []

  for (const item of options.tools ?? []) {
    if (item.type === "function" && item.name === "bash") {
      warnings.push({ type: "unsupported", feature: "codex provider bash tool" })
      continue
    }
    if (item.type === "function" && item.name === "apply_patch") {
      tools.push({
        type: "custom",
        name: "apply_patch",
        description: APPLY_PATCH_DESCRIPTION,
        format: { type: "grammar", syntax: "lark", definition: APPLY_PATCH_LARK_GRAMMAR },
      })
      continue
    }
    if (item.type === "function") {
      warnings.push({ type: "unsupported", feature: `codex provider function tool ${item.name}` })
      continue
    }
    if (item.type === "provider" && item.id === "openai.local_shell") {
      warnings.push({ type: "unsupported", feature: "codex provider local_shell tool" })
      continue
    }
    warnings.push({ type: "unsupported", feature: `codex provider tool ${item.type}` })
  }

  const toolChoice = options.toolChoice?.type === "none" ? "none" : options.toolChoice?.type === "required" ? "required" : "auto"
  return { tools: tools.length ? tools : undefined, toolChoice, warnings }
}
