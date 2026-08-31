import { redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/auth";
import { getCreditTransactions } from "@/lib/data";
import { getBalanceKobo } from "@/lib/billing/credits";
import { formatNgn, NGN_PER_HOUR } from "@/lib/billing/pricing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BuyCredits } from "@/components/app/buy-credits";
import { Wallet, ArrowUpRight, ArrowDownRight, Gift } from "lucide-react";

const typeMeta = {
  signup_bonus: { label: "Welcome credit", icon: Gift, tone: "text-brand-500" },
  purchase: { label: "Purchase", icon: ArrowUpRight, tone: "text-brand-500" },
  meeting_charge: { label: "Meeting", icon: ArrowDownRight, tone: "text-muted-foreground" },
  refund: { label: "Refund", icon: ArrowUpRight, tone: "text-brand-500" },
} as const;

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [balanceKobo, transactions] = await Promise.all([
    getBalanceKobo(session.user.id),
    getCreditTransactions(session.user.id),
  ]);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Credits</h1>
        <p className="text-sm text-muted-foreground">
          Pay only for the meeting time your notetaker actually records.
        </p>
      </header>

      <div className="flex flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="overflow-hidden border-brand-700 bg-brand-900 text-white">
            <CardContent className="flex flex-col gap-1 py-6">
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/60">
                <Wallet className="h-3.5 w-3.5" />
                Current balance
              </span>
              <span className="font-heading text-4xl font-semibold">
                {formatNgn(balanceKobo)}
              </span>
              <span className="mt-1 text-sm text-white/60">
                ≈ {(balanceKobo / (NGN_PER_HOUR * 100)).toFixed(1)} hours of meetings left
              </span>
              {balanceKobo <= 0 && (
                <Badge variant="destructive" className="mt-3 w-fit">
                  Low balance — top up to keep auto-join active
                </Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buy credits</CardTitle>
              <CardDescription>₦{NGN_PER_HOUR.toLocaleString("en-NG")} per hour of meeting time, billed by the minute.</CardDescription>
            </CardHeader>
            <CardContent>
              <BuyCredits />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Transaction history</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <div className="flex flex-col divide-y">
                {transactions.map((t) => {
                  const meta = typeMeta[t.type];
                  const Icon = meta.icon;
                  const positive = t.amountKobo > 0;
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className={`h-4 w-4 ${meta.tone}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {meta.label} · {format(new Date(t.createdAt), "MMM d, yyyy · h:mm a")}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-medium tabular-nums ${
                          positive ? "text-brand-500" : "text-foreground"
                        }`}
                      >
                        {positive ? "+" : ""}
                        {formatNgn(t.amountKobo)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
