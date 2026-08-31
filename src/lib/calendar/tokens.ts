import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";

const REFRESH_SKEW_MS = 60_000;

interface RefreshedToken {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

async function refreshGoogleToken(refreshToken: string): Promise<RefreshedToken> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function refreshMicrosoftToken(refreshToken: string): Promise<RefreshedToken> {
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "openid email profile offline_access Calendars.Read",
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * Returns a usable access token for the user's Google or Microsoft account,
 * refreshing it first if it's missing or about to expire. Returns null if
 * the user hasn't connected that provider.
 */
export async function getValidAccessToken(
  userId: string,
  provider: "google" | "microsoft-entra-id"
): Promise<string | null> {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, provider)),
  });
  if (!account) return null;
  if (!account.refresh_token) return account.access_token ?? null;

  const expiresAtMs = (account.expires_at ?? 0) * 1000;
  if (account.access_token && expiresAtMs - REFRESH_SKEW_MS > Date.now()) {
    return account.access_token;
  }

  const refreshed =
    provider === "google"
      ? await refreshGoogleToken(account.refresh_token)
      : await refreshMicrosoftToken(account.refresh_token);

  await db
    .update(accounts)
    .set({
      access_token: refreshed.access_token,
      expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      refresh_token: refreshed.refresh_token ?? account.refresh_token,
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)));

  return refreshed.access_token;
}
