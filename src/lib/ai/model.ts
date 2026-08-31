import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

export class NoLlmProviderConfiguredError extends Error {
  constructor() {
    super("No LLM provider configured. Set ANTHROPIC_API_KEY or GROQ_API_KEY in .env.local.");
    this.name = "NoLlmProviderConfiguredError";
  }
}

/**
 * Prefers Anthropic when configured (best quality); falls back to Groq
 * (fast, OpenAI-compatible, works with the key already on hand). Swapping
 * in a real ANTHROPIC_API_KEY later upgrades every caller automatically.
 */
export function getChatModel(): LanguageModel {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-5");
  if (process.env.GROQ_API_KEY) return groq("openai/gpt-oss-120b");
  throw new NoLlmProviderConfiguredError();
}
