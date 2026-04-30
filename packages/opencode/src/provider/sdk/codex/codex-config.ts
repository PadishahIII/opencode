import type { FetchFunction } from "@ai-sdk/provider-utils"

export type CodexProviderOptions = {
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  fetch?: FetchFunction
  name?: string
  originator?: string
  userAgent?: string
  installationID?: string
  windowID?: string
  sessionID?: string
  accountID?: string
}

export type CodexConfig = ReturnType<typeof normalizeCodexConfig>

export function normalizeCodexConfig(options: CodexProviderOptions = {}) {
  return {
    provider: options.name ?? "codex",
    baseURL: (options.baseURL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: options.apiKey,
    headers: options.headers ?? {},
    fetch: options.fetch ?? fetch,
    originator: options.originator ?? "codex_exec",
    userAgent: options.userAgent ?? "codex_exec/0.124.0 opencode",
    installationID: options.installationID ?? process.env.OPENCODE_INSTALL_ID ?? crypto.randomUUID(),
    windowID: options.windowID ?? process.env.OPENCODE_CODEX_WINDOW_ID ?? `${crypto.randomUUID()}:0`,
    sessionID: options.sessionID ?? process.env.OPENCODE_CODEX_SESSION_ID ?? crypto.randomUUID(),
    accountID: options.accountID,
  }
}
