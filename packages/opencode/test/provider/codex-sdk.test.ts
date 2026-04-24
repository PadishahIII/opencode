import { describe, expect, test } from "bun:test"
import { streamText, tool } from "ai"
import z from "zod"
import { createCodexProvider } from "../../src/provider/sdk/codex"

function eventStream(events: unknown[]) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
  })
}

describe("codex sdk", () => {
  test("constructs codex responses request with headers and metadata", async () => {
    let request: { url: string; headers: Headers; body: any } | undefined
    const provider = createCodexProvider({
      apiKey: "test-codex-key",
      baseURL: "https://example.test/codex/v1",
      installationID: "install-test",
      windowID: "window-test",
      fetch: (async (url, init) => {
        request = {
          url: String(url),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        }
        return eventStream([
          { type: "response.created", response: { id: "resp_test", created_at: 1, model: "gpt-5.4" } },
          { type: "response.output_item.added", output_index: 0, item: { id: "msg_test", type: "message" } },
          { type: "response.output_text.delta", item_id: "msg_test", delta: "hello" },
          { type: "response.output_item.done", output_index: 0, item: { id: "msg_test", type: "message" } },
          {
            type: "response.completed",
            response: { usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: {}, output_tokens_details: {} } },
          },
        ])
      }) as typeof fetch,
    })

    await streamText({
      model: provider.responses("gpt-5.4"),
      messages: [
        { role: "system", content: "system text" },
        { role: "user", content: "hello" },
      ],
    }).consumeStream()

    expect(request?.url).toBe("https://example.test/codex/v1/responses")
    expect(request?.headers.get("authorization")).toBe("Bearer test-codex-key")
    expect(request?.headers.get("accept")).toContain("text/event-stream")
    expect(request?.headers.get("x-codex-window-id")).toBe("window-test")
    expect(request?.headers.get("x-codex-installation-id")).toBe("install-test")
    expect(request?.body.model).toBe("gpt-5.4")
    expect(request?.body.instructions).toBe("system text")
    expect(request?.body.input).toEqual([{ role: "user", content: [{ type: "input_text", text: "hello" }] }])
    expect(request?.body.client_metadata).toMatchObject({ client: "opencode", provider: "codex", window_id: "window-test" })
  })

  test("parses codex apply_patch calls as client tool calls", async () => {
    const provider = createCodexProvider({
      apiKey: "test-codex-key",
      baseURL: "https://example.test/v1",
      fetch: (async () =>
        eventStream([
          { type: "response.created", response: { id: "resp_test", created_at: 1, model: "gpt-5.4" } },
          {
            type: "response.output_item.done",
            output_index: 0,
            item: {
              id: "fc_test",
              type: "custom_tool_call",
              call_id: "call_test",
              name: "apply_patch",
              input: "*** Begin Patch\n*** Add File: hello.py\n+print('hello')\n*** End Patch\n",
            },
          },
          {
            type: "response.completed",
            response: { usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: {}, output_tokens_details: {} } },
          },
        ])) as unknown as typeof fetch,
    })

    let called = false
    const result = streamText({
      model: provider.responses("gpt-5.4"),
      messages: [{ role: "user", content: "write file" }],
      tools: {
        apply_patch: tool({
          description: "apply patch",
          inputSchema: z.object({ patchText: z.string() }),
          execute: async () => {
            called = true
            return { output: "ok" }
          },
        }),
      },
    })
    await result.consumeStream()

    expect(called).toBe(true)
  })

  test("declares apply_patch as a codex custom grammar tool", async () => {
    let request: { body: any } | undefined
    const provider = createCodexProvider({
      apiKey: "test-codex-key",
      baseURL: "https://example.test/v1",
      fetch: (async (_url: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
        request = { body: JSON.parse(String(init?.body)) }
        return eventStream([
          { type: "response.created", response: { id: "resp_test", created_at: 1, model: "gpt-5.4" } },
          { type: "response.completed", response: { usage: { input_tokens: 1, output_tokens: 1 } } },
        ])
      }) as unknown as typeof fetch,
    })

    await streamText({
      model: provider.responses("gpt-5.4"),
      messages: [{ role: "user", content: "write file" }],
      tools: {
        apply_patch: tool({
          description: "apply patch",
          inputSchema: z.object({ patchText: z.string() }),
          execute: async () => ({ output: "ok" }),
        }),
      },
    }).consumeStream()

    expect(request?.body.tools).toContainEqual(
      expect.objectContaining({
        type: "custom",
        name: "apply_patch",
        format: expect.objectContaining({ type: "grammar", syntax: "lark" }),
      }),
    )
  })
})
