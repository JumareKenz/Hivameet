import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";

export class NoLlmProviderConfiguredError extends Error {
  constructor() {
    super("No LLM provider configured. Set ANTHROPIC_API_KEY or GROQ_API_KEY in .env.local.");
    this.name = "NoLlmProviderConfiguredError";
  }
}

interface ModelChainEntry {
  name: string;
  model: LanguageModel;
}

/**
 * Ordered by preference, not just "whichever is configured": Anthropic
 * first when available (best reasoning/instruction-following quality),
 * Groq second. openai/gpt-oss-120b is Groq's strongest current
 * production model for structured-output reliability and long-context
 * reasoning — swap this one line if Groq ships something stronger later,
 * no caller needs to change.
 */
function getModelChain(): ModelChainEntry[] {
  const chain: ModelChainEntry[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    chain.push({ name: "anthropic:claude-sonnet-5", model: anthropic("claude-sonnet-5") });
  }
  if (process.env.GROQ_API_KEY) {
    chain.push({ name: "groq:openai/gpt-oss-120b", model: groq("openai/gpt-oss-120b") });
  }
  return chain;
}

/** Single model for callers that don't need structured-output fallback (e.g. the Ask-AI chat stream). */
export function getChatModel(): LanguageModel {
  const [first] = getModelChain();
  if (!first) throw new NoLlmProviderConfiguredError();
  return first.model;
}

/**
 * Generates structured output validated against `schema`, trying each
 * configured provider in order and falling back to the next on failure
 * (API error, rate limit, or the model's output failing schema validation).
 * Logs which provider/model was tried and why it failed — never the prompt
 * content or any secret.
 */
export async function generateStructuredWithFallback<T extends z.ZodTypeAny>({
  schema,
  system,
  prompt,
  maxOutputTokens = 8192,
}: {
  schema: T;
  system: string;
  prompt: string;
  /**
   * Rich meeting reports (many discussion points/decisions/action items)
   * can run long — the default provider limit is too low and causes the
   * model to get cut off mid-JSON, which then fails schema validation
   * outright (missing required fields) rather than degrading gracefully.
   * Verified against a real 32K-char transcript chunk that reproduced
   * exactly this failure before this was added.
   */
  maxOutputTokens?: number;
}): Promise<z.infer<T>> {
  const chain = getModelChain();
  if (chain.length === 0) throw new NoLlmProviderConfiguredError();

  let lastError: unknown;
  for (const entry of chain) {
    try {
      const { output } = await generateText({
        model: entry.model,
        output: Output.object({ schema }),
        system,
        prompt,
        maxOutputTokens,
      });
      // Cast bridges a generic-inference gap between our T and Output.object's
      // own inferred OBJECT type param — runtime validation against `schema`
      // already happened inside generateText, this isn't skipping that.
      return output as z.infer<T>;
    } catch (err) {
      lastError = err;
      console.error(
        `[ai] ${entry.name} failed for structured generation, ${
          entry === chain[chain.length - 1] ? "no more fallbacks" : "trying next provider"
        }:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("All configured LLM providers failed to generate structured output.");
}
