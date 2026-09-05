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

// A model asked for a complex, deeply-nested schema occasionally produces
// JSON that's substantively fine but violates one strict-mode rule (a null
// where an empty array belonged, a nullable field omitted instead of set to
// null) — sampling noise, not a persistent prompt/schema mismatch. Verified
// against three real production failures on the same meeting's consolidate
// step, each a *different* schema violation, which is the signature of
// per-attempt noise rather than a bug that retrying would just repeat. Only
// worth retrying schema-validation failures specifically, not e.g. auth or
// rate-limit errors that a same-provider retry can't fix any better than
// falling through to the next provider would.
const RETRIES_PER_PROVIDER = 2;

function isSchemaValidationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /does not match the expected schema|jsonschema/i.test(message);
}

/**
 * Generates structured output validated against `schema`, retrying each
 * configured provider on schema-validation failures before falling back to
 * the next provider in the chain. Logs which provider/model was tried and
 * why it failed — never the prompt content or any secret.
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
    for (let attempt = 1; attempt <= RETRIES_PER_PROVIDER; attempt++) {
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
        const willRetrySameProvider = attempt < RETRIES_PER_PROVIDER && isSchemaValidationError(err);
        console.error(
          `[ai] ${entry.name} failed for structured generation (attempt ${attempt}/${RETRIES_PER_PROVIDER}), ${
            willRetrySameProvider
              ? "retrying same provider"
              : entry === chain[chain.length - 1]
                ? "no more fallbacks"
                : "trying next provider"
          }:`,
          err instanceof Error ? err.message : err
        );
        if (!willRetrySameProvider) break;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("All configured LLM providers failed to generate structured output.");
}
