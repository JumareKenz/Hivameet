// All money is handled in kobo (1 NGN = 100 kobo) to avoid float drift.

export const NGN_PER_HOUR = 1000;
export const KOBO_PER_HOUR = NGN_PER_HOUR * 100;
export const KOBO_PER_MINUTE = KOBO_PER_HOUR / 60;

/** Minimum balance required before the bot is allowed to join a call (5 min buffer). */
export const MIN_BALANCE_TO_JOIN_KOBO = KOBO_PER_MINUTE * 5;

/** New accounts start with one free hour so the product is usable before any purchase. */
export const SIGNUP_BONUS_KOBO = KOBO_PER_HOUR;

export const CREDIT_PACKAGES = [
  { ngn: 1000, label: "1 hour", blurb: "Try it out" },
  { ngn: 5000, label: "5 hours", blurb: "Most popular" },
  { ngn: 15000, label: "15 hours", blurb: "Best value" },
] as const;

export function koboToNgn(kobo: number): number {
  return kobo / 100;
}

export function formatNgn(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(koboToNgn(kobo));
}

/** Charge for a meeting is proportional to its actual duration, rounded up to the next minute. */
export function chargeForDurationKobo(durationSeconds: number): number {
  const minutes = Math.ceil(durationSeconds / 60);
  return Math.round(minutes * KOBO_PER_MINUTE);
}
