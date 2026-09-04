import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  primaryKey,
  pgEnum,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";
import type { IntelligenceReportJson } from "@/lib/intelligence/schema";

// --- Auth.js required tables ---------------------------------------------

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  botDisplayName: text("bot_display_name").default("Hivameet Notetaker"),
  timezone: text("timezone").default("UTC"),
  // Stored in kobo (1 NGN = 100 kobo) to avoid floating-point drift on charges.
  creditBalanceKobo: integer("credit_balance_kobo").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// --- Domain enums ----------------------------------------------------------

export const meetingPlatformEnum = pgEnum("meeting_platform", [
  "google_meet",
  "zoom",
  "ms_teams",
  "unknown",
]);

export const meetingStatusEnum = pgEnum("meeting_status", [
  "scheduled",
  "awaiting_admission",
  "in_progress",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const joinModeEnum = pgEnum("join_mode", [
  "everything",
  "hosted_by_me",
  "internal_only",
  "manual_only",
]);

export const insightTypeEnum = pgEnum("insight_type", [
  "key_insight",
  "recommendation",
]);

// --- Join rules --------------------------------------------------------

export const joinRules = pgTable("join_rules", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mode: joinModeEnum("mode").notNull().default("hosted_by_me"),
  autoJoinEnabled: boolean("auto_join_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --- Meetings ------------------------------------------------------------

export const meetingCreationSourceEnum = pgEnum("meeting_creation_source", [
  // Discovered by polling a connected external calendar (existing flow).
  "calendar_sync",
  // Pasted a live meeting link into "Join a meeting" (existing flow).
  "ad_hoc_join",
  // Created from inside Hivameet via a MeetingProvider (new).
  "hivameet_created",
]);

export const meetings = pgTable(
  "meetings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    agenda: text("agenda"),
    platform: meetingPlatformEnum("platform").notNull().default("unknown"),
    meetingUrl: text("meeting_url"),
    // Set only for meetings Hivameet itself created (see MeetingProvider) —
    // the host-only join link, e.g. a Zoom start_url. Never shown to invitees.
    hostUrl: text("host_url"),
    creationSource: meetingCreationSourceEnum("creation_source")
      .notNull()
      .default("ad_hoc_join"),
    // The provider-side id for a Hivameet-created meeting (Google Calendar
    // event id / Graph event id / Zoom meeting id) — distinct from
    // calendarEventId, which identifies an externally-discovered event this
    // meeting was synced *from*.
    providerMeetingId: text("provider_meeting_id"),
    calendarEventId: text("calendar_event_id"),
    botProviderSessionId: text("bot_provider_session_id"),
    status: meetingStatusEnum("status").notNull().default("scheduled"),
    timezone: text("timezone"),
    // The organizer's intended schedule — set at creation time, independent
    // of startedAt/endedAt below, which reflect when the bot actually
    // recorded. A Hivameet-created meeting has both; a synced/ad-hoc one
    // typically only gets startedAt/endedAt once the bot actually joins.
    scheduledStartAt: timestamp("scheduled_start_at"),
    scheduledEndAt: timestamp("scheduled_end_at"),
    // Whether Hivameet should auto-dispatch the bot at scheduledStartAt for
    // a meeting created inside Hivameet (separate from the global join_rules
    // used for calendar-sync discovery).
    autoRecord: boolean("auto_record").notNull().default(true),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    durationSeconds: integer("duration_seconds"),
    participantCount: integer("participant_count"),
    audioUrl: text("audio_url"),
    executiveSummary: text("executive_summary"),
    // Structured report content that doesn't need its own interactive/editable
    // table (see actionItems and insights for the parts that do): overview,
    // discussionPoints, decisions, risks, openQuestions, topics. Validated
    // against meetingIntelligenceSchema (src/lib/intelligence.ts) before save.
    intelligenceReport: jsonb("intelligence_report").$type<IntelligenceReportJson>(),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Prevents the calendar sync job from double-dispatching a bot for the
    // same calendar event on overlapping/retried ticks. NULLs (ad-hoc
    // meetings with no calendar event) are not deduped by Postgres.
    uniqueIndex("meetings_user_calendar_event_idx").on(table.userId, table.calendarEventId),
  ]
);

// Invitees added at creation time (before the meeting happens) — distinct
// from meetingParticipants below, which are transcript speakers identified
// *after* the bot records (a real attendee may never speak, and a
// transcript speaker may not have been an invited attendee at all).
export const meetingInvitees = pgTable("meeting_invitees", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
});

export const meetingParticipants = pgTable("meeting_participants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  speakerLabel: text("speaker_label").notNull(), // e.g. "Speaker 1"
  displayName: text("display_name"), // renamed by user, e.g. "Sarah Chen"
});

export const transcriptSegments = pgTable("transcript_segments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  participantId: text("participant_id").references(
    () => meetingParticipants.id,
    { onDelete: "set null" }
  ),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  text: text("text").notNull(),
});

export const insights = pgTable("insights", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  type: insightTypeEnum("type").notNull(),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const actionItemPriorityEnum = pgEnum("action_item_priority", [
  "low",
  "medium",
  "high",
]);

export const actionItems = pgTable("action_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  // Null/unset means the AI found no owner stated — the UI renders that as
  // "Owner not specified" rather than inventing one.
  assignee: text("assignee"),
  dueDate: timestamp("due_date", { mode: "date" }),
  priority: actionItemPriorityEnum("priority").notNull().default("medium"),
  completed: boolean("completed").notNull().default(false),
  // True once a user has edited this item — lets the UI show "edited"
  // instead of implying the AI extracted exactly this wording/owner/date.
  userEdited: boolean("user_edited").notNull().default(false),
  sourceSegmentId: text("source_segment_id").references(
    () => transcriptSegments.id,
    { onDelete: "set null" }
  ),
});

export const reminders = pgTable("reminders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  triggerAt: timestamp("trigger_at", { mode: "date" }),
  sent: boolean("sent").notNull().default(false),
});

export const chatMessages = pgTable("chat_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const exportLogs = pgTable("export_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  destination: text("destination").notNull(), // slack | notion | asana | google_docs | email
  externalUrl: text("external_url"),
  exportedAt: timestamp("exported_at").notNull().defaultNow(),
  metadata: jsonb("metadata"),
});

// --- Billing / self-serve credits ------------------------------------------

export const creditTransactionTypeEnum = pgEnum("credit_transaction_type", [
  "signup_bonus",
  "purchase",
  "meeting_charge",
  "refund",
  "admin_grant",
]);

export const creditTransactions = pgTable("credit_transactions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: creditTransactionTypeEnum("type").notNull(),
  // Positive = credited to the user, negative = debited. Kobo.
  amountKobo: integer("amount_kobo").notNull(),
  balanceAfterKobo: integer("balance_after_kobo").notNull(),
  meetingId: text("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  // Set only for purchases (the Paystack transaction reference). A DB-level
  // unique constraint — not just an app-level "does a row already exist"
  // check — is what actually makes duplicate webhook deliveries safe: two
  // concurrent requests racing the app-level check would both pass it, but
  // only one can win the unique index, so the retry gets guaranteed a
  // conflict and returns "already processed" instead of double-crediting.
  externalReference: text("external_reference"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("credit_transactions_external_reference_idx").on(table.externalReference),
]);

// --- Relations -------------------------------------------------------------

export const usersRelations = relations(users, ({ many, one }) => ({
  meetings: many(meetings),
  creditTransactions: many(creditTransactions),
  joinRules: one(joinRules, {
    fields: [users.id],
    references: [joinRules.userId],
  }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, { fields: [creditTransactions.userId], references: [users.id] }),
  meeting: one(meetings, { fields: [creditTransactions.meetingId], references: [meetings.id] }),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  user: one(users, { fields: [meetings.userId], references: [users.id] }),
  invitees: many(meetingInvitees),
  participants: many(meetingParticipants),
  transcriptSegments: many(transcriptSegments),
  insights: many(insights),
  actionItems: many(actionItems),
  reminders: many(reminders),
  chatMessages: many(chatMessages),
  exportLogs: many(exportLogs),
}));

export const meetingInviteesRelations = relations(meetingInvitees, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingInvitees.meetingId], references: [meetings.id] }),
}));

export const transcriptSegmentsRelations = relations(
  transcriptSegments,
  ({ one }) => ({
    meeting: one(meetings, {
      fields: [transcriptSegments.meetingId],
      references: [meetings.id],
    }),
    participant: one(meetingParticipants, {
      fields: [transcriptSegments.participantId],
      references: [meetingParticipants.id],
    }),
  })
);

export const meetingParticipantsRelations = relations(
  meetingParticipants,
  ({ one, many }) => ({
    meeting: one(meetings, {
      fields: [meetingParticipants.meetingId],
      references: [meetings.id],
    }),
    segments: many(transcriptSegments),
  })
);
