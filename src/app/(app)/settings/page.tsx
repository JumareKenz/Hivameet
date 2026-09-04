import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { getJoinRules } from "@/lib/data";
import { db } from "@/db";
import { accounts, joinRules, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SyncCalendarButton } from "@/components/app/sync-calendar-button";

const joinModeOptions = [
  { value: "everything", label: "Join everything", description: "Every meeting on my calendar" },
  { value: "hosted_by_me", label: "Meetings I host", description: "Only calls where I'm the organizer" },
  { value: "internal_only", label: "Internal calls only", description: "Skip meetings with external guests" },
  { value: "manual_only", label: "Manual only", description: "Never auto-join — I'll paste links myself" },
];

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;
  const [rules, user, connectedAccounts] = await Promise.all([
    getJoinRules(userId),
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.accounts.findMany({ where: eq(accounts.userId, userId) }),
  ]);
  const connectedProviders = new Set(connectedAccounts.map((a) => a.provider));
  const hasCalendarConnection =
    connectedProviders.has("google") || connectedProviders.has("microsoft-entra-id");
  const zoomCreationConfigured = Boolean(
    process.env.ZOOM_S2S_ACCOUNT_ID && process.env.ZOOM_S2S_CLIENT_ID && process.env.ZOOM_S2S_CLIENT_SECRET
  );

  // Auth.js only writes fresh tokens/scope to the accounts table the first
  // time a provider is linked — signing in again with an account that's
  // already linked is a no-op on the stored row (verified against
  // @auth/core's handle-login.js: the userByAccount-exists branch just
  // creates a session, it never calls linkAccount again). So when we widen
  // the requested OAuth scope, anyone who connected before that change is
  // stuck on their old scope forever unless the link is broken first. This
  // action does that: drop the stored account, then invoke signIn while
  // already authenticated — that hits the *other* branch in handle-login.js
  // ("user is already signed in ... link the accounts safely"), which does
  // call linkAccount, writing the newly-consented scope and tokens.
  async function reconnectProvider(formData: FormData) {
    "use server";
    const provider = formData.get("provider") as "google" | "microsoft-entra-id";
    await db.delete(accounts).where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)));
    await signIn(provider, { redirectTo: "/settings" });
  }

  async function updateJoinRules(formData: FormData) {
    "use server";
    const mode = formData.get("mode") as string;
    const autoJoinEnabled = formData.get("autoJoinEnabled") === "on";
    const botDisplayName = formData.get("botDisplayName") as string;

    await db
      .insert(joinRules)
      .values({ userId, mode: mode as typeof joinRules.$inferInsert.mode, autoJoinEnabled })
      .onConflictDoUpdate({
        target: joinRules.userId,
        set: { mode: mode as typeof joinRules.$inferInsert.mode, autoJoinEnabled, updatedAt: new Date() },
      });

    if (botDisplayName) {
      await db.update(users).set({ botDisplayName }).where(eq(users.id, userId));
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Control how and when your notetaker joins calls.
        </p>
      </header>

      <div className="flex flex-col gap-6 px-6 py-6 max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Connections</CardTitle>
            <CardDescription>
              Calendars power auto-join and let Hivameet create real Google Meet, Teams, and Zoom
              meetings on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
              <div className="flex items-center gap-2">
                <Badge variant={connectedProviders.has("google") ? "default" : "secondary"}>
                  Google {connectedProviders.has("google") ? "connected" : "not connected"}
                </Badge>
                <span className="text-sm text-muted-foreground">Calendar + Google Meet</span>
              </div>
              <form action={reconnectProvider}>
                <input type="hidden" name="provider" value="google" />
                <Button type="submit" size="sm" variant="outline" disabled={!process.env.AUTH_GOOGLE_ID}>
                  {connectedProviders.has("google") ? "Reconnect" : "Connect"}
                </Button>
              </form>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-2">
                <Badge variant={connectedProviders.has("microsoft-entra-id") ? "default" : "secondary"}>
                  Microsoft {connectedProviders.has("microsoft-entra-id") ? "connected" : "not connected"}
                </Badge>
                <span className="text-sm text-muted-foreground">Calendar + Teams</span>
              </div>
              <form action={reconnectProvider}>
                <input type="hidden" name="provider" value="microsoft-entra-id" />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={!process.env.AUTH_MICROSOFT_ENTRA_ID_ID}
                >
                  {connectedProviders.has("microsoft-entra-id") ? "Reconnect" : "Connect"}
                </Button>
              </form>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 last:pb-0">
              <div className="flex items-center gap-2">
                <Badge variant={zoomCreationConfigured ? "default" : "secondary"}>
                  Zoom {zoomCreationConfigured ? "available" : "not configured"}
                </Badge>
                <span className="text-sm text-muted-foreground">Meeting creation only</span>
              </div>
            </div>
            {!zoomCreationConfigured && (
              <p className="pt-3 text-sm text-muted-foreground">
                Zoom meeting creation isn&apos;t connected to any personal account — it uses a single
                Server-to-Server app configured by whoever runs this Hivameet instance, shared by every
                user. Ask them to set it up if you need to create Zoom meetings from Hivameet.
              </p>
            )}
            {!hasCalendarConnection && (
              <p className="pt-3 text-sm text-muted-foreground">
                Connect Google or Microsoft to let auto-join scan your calendar for meetings that are
                about to start.
              </p>
            )}
            <div className="pt-3">
              <SyncCalendarButton />
            </div>
          </CardContent>
        </Card>

        <form action={updateJoinRules} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Bot identity</CardTitle>
            <CardDescription>The name participants see when the bot joins.</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="botDisplayName" className="mb-2 block">
              Bot display name
            </Label>
            <Input
              id="botDisplayName"
              name="botDisplayName"
              defaultValue={user?.botDisplayName ?? "Hivameet Notetaker"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auto-join</CardTitle>
            <CardDescription>
              Automatically dispatch the bot to meetings detected on your connected calendar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable auto-join</p>
                <p className="text-sm text-muted-foreground">
                  Requires a connected Google or Microsoft calendar.
                </p>
              </div>
              <Switch
                name="autoJoinEnabled"
                defaultChecked={rules.autoJoinEnabled}
              />
            </div>

            <div>
              <Label htmlFor="mode" className="mb-2 block">
                Join rule
              </Label>
              <Select name="mode" defaultValue={rules.mode}>
                <SelectTrigger id="mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {joinModeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="self-start">
          Save changes
        </Button>
        </form>
      </div>
    </div>
  );
}
