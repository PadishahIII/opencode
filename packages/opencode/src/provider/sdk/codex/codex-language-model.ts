import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  SharedV3Warning,
} from "@ai-sdk/provider"
import type { CodexConfig } from "./codex-config"
import type { CodexResponseEvent } from "./codex-api-types"
import { convertCodexInput } from "./codex-convert-input"
import { convertCodexTools } from "./codex-convert-tools"
import { parseCodexStream } from "./codex-stream-parser"

function compact<T extends Record<string, any>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function sse(res: Response) {
  const body = res.body
  if (!body) throw new Error("Codex response body is empty")
  const decoder = new TextDecoder()
  let buffer = ""

  return body.pipeThrough(
    new TransformStream<Uint8Array, CodexResponseEvent>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() ?? ""
        for (const event of events) {
          const data = event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n")
          if (!data || data === "[DONE]") continue
          controller.enqueue(JSON.parse(data))
        }
      },
      flush(controller) {
        const data = buffer
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
        if (data && data !== "[DONE]") controller.enqueue(JSON.parse(data))
      },
    }),
  )
}

export class CodexLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const
  readonly supportedUrls: Record<string, RegExp[]> = {}

  constructor(
    readonly modelId: string,
    private readonly config: CodexConfig,
  ) {}

  get provider() {
    return `${this.config.provider}.responses`
  }

  async doGenerate(_options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    throw new Error("Codex provider only supports streaming responses")
  }

  async doStream(options: LanguageModelV3CallOptions) {
    const input = convertCodexInput(options)
    const tools = convertCodexTools(options)
    const warnings = [...input.warnings, ...tools.warnings] as SharedV3Warning[]
    const codexOptions = options.providerOptions?.codex ?? {}
    const openaiOptions = options.providerOptions?.openai ?? {}
    const body = compact({
      model: this.modelId,
      instructions: (codexOptions.instructions as string | undefined) ?? input.instructions,
      input: input.input,
      tools: tools.tools ?? [],
      tool_choice: tools.toolChoice,
      parallel_tool_calls: true,
      reasoning: (codexOptions.reasoning ?? openaiOptions.reasoning) as unknown,
      store: (codexOptions.store ?? openaiOptions.store ?? false) as unknown,
      stream: true,
      include: (codexOptions.include ?? openaiOptions.include ?? []) as unknown,
      prompt_cache_key: (codexOptions.promptCacheKey ?? openaiOptions.promptCacheKey) as unknown,
      text: codexOptions.text as unknown,
      client_metadata: compact({
        client: "opencode",
        provider: "codex",
        session_id: codexOptions.sessionID,
        window_id: this.config.windowID,
      }),
    })

    const headers = compact({
      Authorization: this.config.apiKey ? `Bearer ${this.config.apiKey}` : undefined,
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "x-client-request-id": crypto.randomUUID(),
      "x-codex-window-id": this.config.windowID,
      "x-codex-installation-id": this.config.installationID,
      "ChatGPT-Account-ID": this.config.accountID,
      ...this.config.headers,
      ...options.headers,
    }) as Record<string, string>

    const response = await this.config.fetch(`${this.config.baseURL}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.abortSignal,
    })

    if (!response.ok) {
      throw new Error(`Codex request failed: ${response.status} ${await response.text()}`)
    }

    return {
      stream: parseCodexStream(sse(response), warnings),
      request: { body },
      response: { headers: Object.fromEntries(response.headers.entries()) },
    }
  }
}
