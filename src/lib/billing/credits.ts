import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, meetings, creditTransactions } from "@/db/schema";
import { MIN_BALANCE_TO_JOIN_KOBO, chargeForDurationKobo } from "./pricing";

export async function getBalanceKobo(userId: string): Promise<number> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { creditBalanceKobo: true },
  });
  return user?.creditBalanceKobo ?? 0;
}

export async function hasEnoughCreditsToJoin(userId: string): Promise<boolean> {
  return (await getBalanceKobo(userId)) >= MIN_BALANCE_TO_JOIN_KOBO;
}

/**
 * Applies a signed credit adjustment (positive = credit, negative = debit)
 * and records it in the ledger, atomically. Balance is allowed to go
 * negative for usage charges — enforcement happens before the bot joins,
 * not by silently under-charging for time already used.
 */
async function applyCreditDelta(
  userId: string,
  amountKobo: number,
  type: (typeof creditTransactions.$inferInsert)["type"],
  description: string,
  opts?: { meetingId?: string; metadata?: unknown; externalReference?: string }
) {
  return db.transaction(async (tx) => {
    // Guard first: if this external reference (a Paystack transaction
    // reference) was already recorded, the unique index on
    // externalReference makes this insert a no-op and we bail out before
    // touching the balance — this is what actually prevents a double
    // credit under concurrent duplicate webhook deliveries, not just the
    // caller's own pre-check.
    if (opts?.externalReference) {
      const [inserted] = await tx
        .insert(creditTransactions)
        .values({
          userId,
          type,
          amountKobo,
          balanceAfterKobo: 0, // placeholder, corrected below once we know the real balance
          meetingId: opts?.meetingId,
          description,
          metadata: opts?.metadata,
          externalReference: opts.externalReference,
        })
        .onConflictDoNothing({ target: creditTransactions.externalReference })
        .returning({ id: creditTransactions.id });

      if (!inserted) {
        return (await tx.query.users.findFirst({ where: eq(users.id, userId), columns: { creditBalanceKobo: true } }))
          ?.creditBalanceKobo ?? 0;
      }

      const [updated] = await tx
        .update(users)
        .set({ creditBalanceKobo: sql`${users.creditBalanceKobo} + ${amountKobo}` })
        .where(eq(users.id, userId))
        .returning({ balance: users.creditBalanceKobo });
      await tx
        .update(creditTransactions)
        .set({ balanceAfterKobo: updated.balance })
        .where(eq(creditTransactions.id, inserted.id));
      return updated.balance;
    }

    const [updated] = await tx
      .update(users)
      .set({ creditBalanceKobo: sql`${users.creditBalanceKobo} + ${amountKobo}` })
      .where(eq(users.id, userId))
      .returning({ balance: users.creditBalanceKobo });

    await tx.insert(creditTransactions).values({
      userId,
      type,
      amountKobo,
      balanceAfterKobo: updated.balance,
      meetingId: opts?.meetingId,
      description,
      metadata: opts?.metadata,
    });

    return updated.balance;
  });
}

export function grantCredits(
  userId: string,
  amountKobo: number,
  type: "signup_bonus" | "purchase" | "refund" | "admin_grant",
  description: string,
  metadata?: unknown,
  externalReference?: string
) {
  return applyCreditDelta(userId, Math.abs(amountKobo), type, description, { metadata, externalReference });
}

/** Charges the user for a completed meeting based on its actual duration. */
export async function chargeForMeeting(meetingId: string) {
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
  if (!meeting || !meeting.durationSeconds || meeting.durationSeconds <= 0) return;

  const chargeKobo = chargeForDurationKobo(meeting.durationSeconds);
  await applyCreditDelta(
    meeting.userId,
    -chargeKobo,
    "meeting_charge",
    `${Math.ceil(meeting.durationSeconds / 60)} min — "${meeting.title}"`,
    { meetingId }
  );
}
