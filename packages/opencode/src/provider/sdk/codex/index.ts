import { CodexLanguageModel } from "./codex-language-model"
import { normalizeCodexConfig, type CodexProviderOptions } from "./codex-config"

export function createCodexProvider(options: CodexProviderOptions = {}) {
  const config = normalizeCodexConfig(options)
  return {
    languageModel(modelID: string) {
      return new CodexLanguageModel(modelID, config)
    },
    responses(modelID: string) {
      return new CodexLanguageModel(modelID, config)
    },
  }
}
