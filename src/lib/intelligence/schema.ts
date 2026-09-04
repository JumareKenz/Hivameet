import { z } from "zod";

// The full structured report a transcript is turned into. Kept as one
// schema (rather than one ad-hoc shape per prompt) so both the single-pass
// and chunked/consolidated pipelines (see chunking.ts) produce and validate
// against the exact same contract, and so the meeting detail page has one
// typed shape to render regardless of which path generated it.
//
// Accuracy rules baked into field descriptions, not just the system prompt —
// schema descriptions are part of what the model sees during structured
// generation, so "never invent an owner" etc. lives right next to the field
// it constrains.

const actionItemSchema = z.object({
  text: z.string().describe("The concrete task, phrased as an action."),
  assignee: z
    .string()
    .nullable()
    .describe("The owner's name exactly as stated in the transcript. Null if no owner was stated — never guess one."),
  dueDate: z
    .string()
    .nullable()
    .describe("ISO 8601 date if a deadline was explicitly mentioned, else null. Never invent a date."),
  priority: z
    .enum(["low", "medium", "high"])
    .describe("Inferred urgency from context (tone, stated deadlines, dependencies). Default medium if unclear."),
  context: z
    .string()
    .nullable()
    .describe("One sentence of surrounding context for why this matters, if useful. Null if the task is self-explanatory."),
});

const decisionSchema = z.object({
  decision: z.string().describe("The decision that was made, stated plainly."),
  context: z.string().describe("Why this decision came up / what problem it addresses."),
  owner: z.string().nullable().describe("Who made or is accountable for the decision, if stated. Null if not stated."),
  implications: z.string().nullable().describe("What this decision affects going forward, if evident from the discussion."),
});

const discussionPointSchema = z.object({
  topic: z.string().describe("Short label for this discussion topic."),
  summary: z.string().describe("What was actually discussed — substance, not a keyword list."),
  viewpoints: z
    .array(z.string())
    .describe("Distinct or competing viewpoints raised, if any. Empty array if the discussion was one-sided or purely informational."),
  conclusion: z.string().nullable().describe("How this topic was left — resolved, tabled, escalated. Null if genuinely open-ended."),
});

const riskSchema = z.object({
  description: z.string().describe("The risk, blocker, dependency, or concern."),
  severity: z.enum(["low", "medium", "high"]).describe("Inferred impact if this isn't addressed."),
  wasExplicit: z
    .boolean()
    .describe("True if someone actually raised this concern in the meeting; false if this is your own inference from context. Never blur this distinction."),
});

const topicMapEntrySchema = z.object({
  label: z.string().describe("A short theme label."),
  approxTimestampMs: z
    .number()
    .nullable()
    .describe("Approximate start time in milliseconds from meeting start where this theme begins, if identifiable from the transcript's timestamps. Null if not clear."),
});

export const meetingIntelligenceSchema = z.object({
  executiveSummary: z
    .string()
    .describe(
      "A multi-paragraph executive summary: why the meeting happened, what was discussed, what mattered, what was decided, where things stand, and what happens next. " +
        "Length should scale with the meeting's actual complexity — a short, simple meeting deserves a short summary; a long, dense meeting deserves several paragraphs. " +
        "Do not pad a simple meeting to sound more substantial than it was."
    ),
  overview: z.object({
    purpose: z.string().describe("Why this meeting happened, in one or two sentences."),
    majorTopics: z.array(z.string()).describe("The handful of major topics covered, as short labels."),
  }),
  discussionPoints: z.array(discussionPointSchema),
  decisions: z
    .array(decisionSchema)
    .describe("Actual decisions made. Empty array if none were — never invent one to fill this out."),
  actionItems: z.array(actionItemSchema),
  keyInsights: z
    .array(z.string())
    .describe("Higher-level takeaways — business, technical, operational, or strategic implications. Not a restatement of the transcript."),
  recommendations: z
    .array(z.object({ text: z.string(), rationale: z.string().nullable() }))
    .describe("Your own suggested next steps based on the discussion. These are AI recommendations, not decisions the group made — phrase them that way."),
  risks: z.array(riskSchema),
  openQuestions: z.array(z.string()).describe("Questions raised that were left unresolved."),
  topics: z.array(topicMapEntrySchema).describe("A concise map of major themes across the meeting."),
});

export type MeetingIntelligence = z.infer<typeof meetingIntelligenceSchema>;

// Used by the chunked pipeline (chunking.ts) for per-chunk extraction, which
// intentionally omits fields that only make sense once the whole meeting has
// been seen (executiveSummary, overview) — those are synthesized once, in
// the final consolidation pass, from all chunks' extractions together.
export const chunkExtractionSchema = z.object({
  discussionPoints: z.array(discussionPointSchema),
  decisions: z.array(decisionSchema),
  actionItems: z.array(actionItemSchema),
  keyInsights: z.array(z.string()),
  risks: z.array(riskSchema),
  openQuestions: z.array(z.string()),
  topics: z.array(topicMapEntrySchema),
});

export type ChunkExtraction = z.infer<typeof chunkExtractionSchema>;

/** The subset of MeetingIntelligence persisted as JSON on meetings.intelligence_report — excludes executiveSummary, actionItems, and keyInsights, which have their own columns/tables. */
export type IntelligenceReportJson = Pick<
  MeetingIntelligence,
  "overview" | "discussionPoints" | "decisions" | "recommendations" | "risks" | "openQuestions" | "topics"
>;
