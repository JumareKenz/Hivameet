"use client";

import { useState, useTransition } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CREDIT_PACKAGES } from "@/lib/billing/pricing";
import { toast } from "sonner";

export function BuyCredits() {
  const [selected, setSelected] = useState<number>(CREDIT_PACKAGES[1].ngn);
  const [pending, startTransition] = useTransition();

  function handleBuy() {
    startTransition(async () => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ngn: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't start checkout");
        return;
      }
      window.location.href = data.authorizationUrl;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CREDIT_PACKAGES.map((pkg) => {
          const active = selected === pkg.ngn;
          return (
            <Card
              key={pkg.ngn}
              onClick={() => setSelected(pkg.ngn)}
              className={cn(
                "cursor-pointer border-2 py-4 transition-all",
                active
                  ? "border-primary shadow-md shadow-primary/10"
                  : "border-border hover:border-primary/40"
              )}
            >
              <CardContent className="flex flex-col items-center gap-1 text-center">
                <span className="text-xs font-medium uppercase tracking-wide text-gold-600">
                  {pkg.blurb}
                </span>
                <span className="font-heading text-2xl font-semibold">
                  ₦{pkg.ngn.toLocaleString("en-NG")}
                </span>
                <span className="text-sm text-muted-foreground">{pkg.label} of meetings</span>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Button onClick={handleBuy} disabled={pending} size="lg" className="w-full gap-2 sm:w-auto sm:self-end">
        <Zap className="h-4 w-4" />
        {pending ? "Starting checkout..." : `Buy ₦${selected.toLocaleString("en-NG")} in credits`}
      </Button>
    </div>
  );
}
