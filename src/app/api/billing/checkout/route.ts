import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CREDIT_PACKAGES } from "@/lib/billing/pricing";

// No payment gateway is wired up yet — this exists so the self-serve
// purchase flow is real end-to-end except for the actual charge. Swap in
// Paystack/Flutterwave (or whichever gateway is chosen) here: create the
// transaction/checkout session with them, redirect the user, and grant
// credits from their webhook once payment is confirmed — never grant
// credits directly from this route based on the client's say-so.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ngn } = await req.json();
  if (!CREDIT_PACKAGES.some((p) => p.ngn === ngn)) {
    return NextResponse.json({ error: "Invalid package" }, { status: 400 });
  }

  return NextResponse.json(
    {
      error:
        "Payments aren't connected yet. Set up a payment gateway (e.g. Paystack) and wire it into /api/billing/checkout.",
    },
    { status: 424 }
  );
}
