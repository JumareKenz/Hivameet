import { auth } from "@/auth";
import { getJoinRules } from "@/lib/data";
import { db } from "@/db";
import { accounts, joinRules, users } from "@/db/schema";
import { eq } from "drizzle-orm";
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
  const userId = session!.user.id;
  const [rules, user, connectedAccounts] = await Promise.all([
    getJoinRules(userId),
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.accounts.findMany({ where: eq(accounts.userId, userId) }),
  ]);
  const connectedProviders = new Set(connectedAccounts.map((a) => a.provider));
  const hasCalendarConnection =
    connectedProviders.has("google") || connectedProviders.has("microsoft-entra-id");

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
            <CardTitle>Calendar connections</CardTitle>
            <CardDescription>
              Auto-join scans these calendars every minute for meetings that are about to start.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={connectedProviders.has("google") ? "default" : "secondary"}>
                Google {connectedProviders.has("google") ? "connected" : "not connected"}
              </Badge>
              <Badge variant={connectedProviders.has("microsoft-entra-id") ? "default" : "secondary"}>
                Microsoft {connectedProviders.has("microsoft-entra-id") ? "connected" : "not connected"}
              </Badge>
            </div>
            {!hasCalendarConnection && (
              <p className="text-sm text-muted-foreground">
                Sign out and back in with Google or Microsoft to connect a calendar — auto-join
                won&apos;t do anything until then.
              </p>
            )}
            <div>
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
