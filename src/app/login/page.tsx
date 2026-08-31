import Image from "next/image";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2 } from "lucide-react";

const highlights = [
  "Joins Google Meet, Zoom, and Teams automatically",
  "Word-for-word transcripts with speaker diarization",
  "Executive summaries, decisions, and action items — in minutes",
];

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID);
  const microsoftEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const demoEnabled = process.env.NODE_ENV !== "production";

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-brand-900 lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(circle at 15% 0%, color-mix(in oklab, var(--color-brand-500) 55%, transparent), transparent 55%), radial-gradient(circle at 85% 100%, color-mix(in oklab, var(--color-gold-500) 30%, transparent), transparent 50%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(color-mix(in oklab, white 100%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, white 100%, transparent) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />

        <div className="relative z-10">
          <Image
            src="/brand/hiva-logo-dark.png"
            alt="Hiva"
            width={140}
            height={147}
            className="h-14 w-auto"
            priority
          />
        </div>

        <div className="relative z-10 flex flex-col gap-8">
          <div>
            <p className="text-sm font-medium tracking-wide text-gold-400">
              MEETINGS, HANDLED
            </p>
            <h1 className="mt-3 max-w-md font-heading text-4xl font-semibold leading-[1.15] text-white">
              Every call, captured. Every decision, remembered.
            </h1>
          </div>
          <ul className="flex flex-col gap-3">
            {highlights.map((h) => (
              <li key={h} className="flex items-start gap-3 text-sm text-white/80">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                {h}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-white/50">
          Hivameet is part of the Hiva product family.
        </p>
      </div>

      {/* Sign-in panel */}
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-4 text-center lg:hidden">
            <Image
              src="/brand/hiva-icon-192.png"
              alt="Hiva"
              width={48}
              height={48}
              className="h-12 w-12"
              priority
            />
          </div>

          <div className="mb-8 text-center lg:text-left">
            <h2 className="font-heading text-2xl font-semibold text-foreground">
              Sign in to Hivameet
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Connect a calendar so your AI notetaker can join meetings automatically.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <Button
                type="submit"
                variant="outline"
                size="lg"
                className="w-full justify-center gap-2 border-border/80 font-medium shadow-sm"
                disabled={!googleEnabled}
              >
                <GoogleIcon />
                Continue with Google
              </Button>
            </form>
            <form
              action={async () => {
                "use server";
                await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
              }}
            >
              <Button
                type="submit"
                variant="outline"
                size="lg"
                className="w-full justify-center gap-2 border-border/80 font-medium shadow-sm"
                disabled={!microsoftEnabled}
              >
                <MicrosoftIcon />
                Continue with Microsoft
              </Button>
            </form>

            {!googleEnabled && !microsoftEnabled && (
              <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                OAuth isn&apos;t configured yet — add AUTH_GOOGLE_ID/SECRET (and/or
                Microsoft) to .env.local to enable real sign-in.
              </p>
            )}

            {demoEnabled && (
              <>
                <div className="relative py-2 text-center text-xs text-muted-foreground">
                  <Separator className="absolute inset-x-0 top-1/2" />
                  <span className="relative z-10 bg-background px-3">or, for local dev</span>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await signIn("demo", { redirectTo: "/dashboard" });
                  }}
                >
                  <Button type="submit" size="lg" className="w-full font-medium">
                    Continue as demo user
                  </Button>
                </form>
              </>
            )}
          </div>

          <p className="mt-10 text-center text-xs text-muted-foreground lg:text-left">
            By continuing you agree to let Hivameet&apos;s notetaker join and
            record meetings on your behalf.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.27A12 12 0 0 0 0 12c0 1.93.46 3.76 1.27 5.38l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#F25022" d="M2 2h9.5v9.5H2V2Z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5V2Z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2v-9.5Z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5v-9.5Z" />
    </svg>
  );
}
