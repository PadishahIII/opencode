import { describe, expect, test } from "bun:test"
import {
  codexProviderConfig,
  providerDisplayName,
  resolveConfigProviders,
  resolveSyntheticProviders,
} from "../../src/cli/cmd/providers"

describe("provider auth helpers", () => {
  test("providerDisplayName prefers configured provider names over raw ids", () => {
    expect(providerDisplayName("codex", {}, { codex: { name: "Codex" } })).toBe("Codex")
  })

  test("resolveConfigProviders includes configured providers missing from models.dev", () => {
    expect(
      resolveConfigProviders({
        existingProviders: {},
        configuredProviders: {
          codex: { name: "Codex" },
        },
        disabled: new Set(),
      }),
    ).toEqual([{ id: "codex", name: "Codex" }])
  })

  test("resolveSyntheticProviders adds codex when absent", () => {
    expect(
      resolveSyntheticProviders({
        existingProviders: {},
        configuredProviders: {},
        pluginProviders: [],
        disabled: new Set(),
      }),
    ).toEqual([{ id: "codex", name: "Codex", hint: "Responses API" }])
  })

  test("resolveSyntheticProviders skips codex when already configured", () => {
    expect(
      resolveSyntheticProviders({
        existingProviders: {},
        configuredProviders: { codex: { name: "Codex" } },
        pluginProviders: [],
        disabled: new Set(),
      }),
    ).toEqual([])
  })

  test("codexProviderConfig returns the expected provider patch", () => {
    expect(codexProviderConfig("https://codex.example.test/v1")).toEqual({
      name: "Codex",
      env: ["CODEX_API_KEY"],
      npm: "@opencode-ai/codex",
      api: "https://codex.example.test/v1",
      options: {
        baseURL: "https://codex.example.test/v1",
      },
    })
  })
})
