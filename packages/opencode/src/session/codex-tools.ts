import { openai } from "@ai-sdk/openai"
import type { ToolSet } from "ai"

type ApplyPatchOperation =
  | { type: "create_file"; path: string; diff: string }
  | { type: "update_file"; path: string; diff: string }
  | { type: "delete_file"; path: string }

type AdaptCodexToolInput = {
  toolName: string
  tool?: ToolSet[string]
}

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

function normalizePatchDiff(diff: string) {
  return diff.endsWith("\n") ? diff : `${diff}\n`
}

function readToolOutput(result: unknown) {
  if (!result || typeof result !== "object") return
  const output = result && "output" in result ? result.output : undefined
  return typeof output === "string" ? output : undefined
}

function bashDescription(commands: string[]) {
  const summary = localShellCommand(commands).trim() || "Run shell command"
  return summary.length <= 120 ? summary : `${summary.slice(0, 117)}...`
}

function outputText(output: unknown) {
  if (typeof output === "string") return output
  if (output && typeof output === "object" && "text" in output && typeof output.text === "string") {
    return output.text
  }
}

function shellEscapeArg(arg: string) {
  return /^[A-Za-z0-9_./:-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\"'\"'`)}'`
}

export function localShellCommand(args: string[]) {
  return args.map(shellEscapeArg).join(" ")
}

export function renderApplyPatchOperation(operation: ApplyPatchOperation) {
  if (operation.type === "delete_file") {
    return `*** Begin Patch\n*** Delete File: ${operation.path}\n*** End Patch\n`
  }
  if (operation.type === "create_file") {
    return `*** Begin Patch\n*** Add File: ${operation.path}\n${normalizePatchDiff(operation.diff)}*** End Patch\n`
  }
  return `*** Begin Patch\n*** Update File: ${operation.path}\n${normalizePatchDiff(operation.diff)}*** End Patch\n`
}

export function codexToolToModelOutput(options: {
  toolName: string
  toolCallId: string
  input: unknown
  output: unknown
}) {
  if (options.toolName === "apply_patch") {
    return {
      type: "text" as const,
      value: outputText(options.output) ?? "Patch applied",
    }
  }

  if (["bash", "local_shell", "shell"].includes(options.toolName)) {
    return {
      type: "json" as const,
      value: {
        output: outputText(options.output) ?? "",
      },
    }
  }
}

export function adaptCodexTool(input: AdaptCodexToolInput): ToolSet[string] | undefined {
  if (input.toolName === "apply_patch") {
    return
  }

  if (input.toolName === "bash") {
    return openai.tools.localShell({
      execute: input.tool
        ? async (args, options) => {
            if (process.platform === "win32") {
              return {
                output: "The codex bash adapter does not support local_shell command translation on Windows yet.",
              }
            }
            if (args.action.env || args.action.user) {
              const unsupported = [
                args.action.env ? "env" : undefined,
                args.action.user ? "user" : undefined,
              ]
                .filter(Boolean)
                .join(", ")
              return {
                output: `Unsupported local_shell fields for the codex bash adapter: ${unsupported}.`,
              }
            }
            const commands = args.action.command
            const result = await input.tool?.execute?.(
              {
                command: localShellCommand(commands),
                timeout: args.action.timeoutMs,
                workdir: args.action.workingDirectory,
                description: bashDescription(commands),
              },
              options as never,
            )
            return {
              output: readToolOutput(result) ?? "(no output)",
            }
          }
        : undefined,
    })
  }
}

export function adaptCodexTools(input: { tools: ToolSet }): ToolSet {
  const adapted: ToolSet = {}
  for (const [toolName, tool] of Object.entries(input.tools)) {
    const codexTool = adaptCodexTool({ toolName, tool })
    if (codexTool) adapted[toolName] = codexTool
  }
  return adapted
}
