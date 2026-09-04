import NextAuth from "next-auth";
import type { Provider } from "@auth/core/providers";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { grantCredits } from "@/lib/billing/credits";
import { SIGNUP_BONUS_KOBO } from "@/lib/billing/pricing";

const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          // Full (read/write) calendar scope: read-only was enough to detect
          // meeting links for auto-join, but creating a Google Meet event
          // from inside Hivameet requires write access too. Anyone who
          // connected under the old read-only scope needs to reconnect —
          // detected via GoogleInsufficientScopeError, see meeting-providers/google.ts.
          scope: "openid email profile https://www.googleapis.com/auth/calendar",
        },
      },
    })
  );
}

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
  providers.push(
    MicrosoftEntraID({
      authorization: {
        // ReadWrite (not just Read): creating a Teams meeting from inside
        // Hivameet needs to write a calendar event via Graph.
        params: { scope: "openid email profile offline_access Calendars.ReadWrite" },
      },
    })
  );
}

// Dev-only convenience login so the app is explorable locally before real
// Google/Microsoft OAuth credentials are configured. Never enabled in production.
if (process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo account",
      credentials: {},
      async authorize() {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, "demo@hivameet.dev"))
          .limit(1);
        return user ?? null;
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      await grantCredits(
        user.id,
        SIGNUP_BONUS_KOBO,
        "signup_bonus",
        "Welcome credit — 1 free hour"
      );
    },
  },
});
