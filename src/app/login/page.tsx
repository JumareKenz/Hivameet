import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID);
  const microsoftEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const demoEnabled = process.env.NODE_ENV !== "production";

  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
            H
          </div>
          <CardTitle className="text-xl">Sign in to Hivameet</CardTitle>
          <CardDescription>
            Connect a calendar so your AI notetaker can join meetings automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full" disabled={!googleEnabled}>
              Continue with Google
            </Button>
          </form>
          <form
            action={async () => {
              "use server";
              await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full" disabled={!microsoftEnabled}>
              Continue with Microsoft
            </Button>
          </form>
          {!googleEnabled && !microsoftEnabled && (
            <p className="text-xs text-muted-foreground text-center">
              OAuth isn&apos;t configured yet — add AUTH_GOOGLE_ID/SECRET (and/or
              Microsoft) to .env.local to enable real sign-in.
            </p>
          )}
          {demoEnabled && (
            <>
              <div className="relative py-1 text-center text-xs text-muted-foreground">
                <span className="bg-card px-2 relative z-10">or, for local dev</span>
                <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
              </div>
              <form
                action={async () => {
                  "use server";
                  await signIn("demo", { redirectTo: "/dashboard" });
                }}
              >
                <Button type="submit" className="w-full">
                  Continue as demo user
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
