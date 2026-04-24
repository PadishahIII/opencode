import type { JSONSchema7 } from "@ai-sdk/provider"

export type CodexInputItem =
  | { role: "user"; content: Array<{ type: "input_text"; text: string }> }
  | { role: "assistant"; content: Array<{ type: "output_text"; text: string }>; id?: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string; id?: string }
  | { type: "function_call_output"; call_id: string; output: string }
  | { type: "custom_tool_call"; call_id: string; name: string; input: string; id?: string }
  | { type: "custom_tool_call_output"; call_id: string; name?: string; output: string }
  | {
      type: "local_shell_call"
      id?: string
      call_id: string
      action: {
        type: "exec"
        command: string[]
        timeout_ms?: number
        working_directory?: string
        env?: Record<string, string>
      }
    }
  | { type: "local_shell_call_output"; call_id: string; output: string }

export type CodexTool =
  | { type: "local_shell" }
  | {
      type: "function"
      name: string
      description?: string
      parameters: JSONSchema7
      strict?: boolean
    }
  | {
      type: "custom"
      name: string
      description: string
      format: { type: "grammar"; syntax: "lark"; definition: string }
    }

export type CodexResponseEvent =
  | { type: "response.created"; response: { id: string; created_at?: number; model?: string } }
  | { type: "response.output_item.added"; output_index: number; item: Record<string, any> }
  | { type: "response.output_item.done"; output_index: number; item: Record<string, any> }
  | { type: "response.output_text.delta"; item_id?: string; delta: string }
  | { type: "response.output_text.done"; item_id?: string; text?: string }
  | { type: "response.function_call_arguments.delta"; output_index: number; item_id?: string; delta: string }
  | { type: "response.function_call_arguments.done"; output_index: number; item_id?: string; arguments: string }
  | { type: "response.reasoning_summary_text.delta"; item_id?: string; summary_index?: number; delta: string }
  | { type: "response.completed"; response: Record<string, any> }
  | { type: "response.failed"; response?: Record<string, any> }
  | { type: "error"; error?: unknown; message?: string }
  | Record<string, any>
