import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { grantCredits } from "@/lib/billing/credits";

// Verification: Paystack signs the raw request body with HMAC-SHA512 using
// the account's secret key, sent in `x-paystack-signature` — same scheme
// already used for this in the Hiva chatbot_platform's HIU ledger webhook
// (app/api/v1/billing.py). Skipping this check would let anyone who finds
// this URL POST a fake charge.success and get free credit.
function isSignatureValid(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signatureHeader) return false;

  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!isSignatureValid(rawBody, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  if (body.event !== "charge.success") {
    return NextResponse.json({ ok: true });
  }

  const data = body.data ?? {};
  const metadata = data.metadata ?? {};
  const userId: string | undefined = metadata.userId;
  const ngn: number | undefined = metadata.ngn;
  const reference: string | undefined = data.reference;

  if (!userId || !ngn || !reference) {
    console.warn(`Paystack charge.success (reference=${reference}) missing userId/ngn metadata — not credited`);
    return NextResponse.json({ ok: true });
  }

  // Idempotency: Paystack can retry webhook delivery (and this endpoint could
  // in principle be hit concurrently for the same reference). grantCredits
  // enforces this atomically via a DB unique constraint on
  // externalReference, not just this pre-check, so a race between two
  // concurrent deliveries can't double-credit — see src/lib/billing/credits.ts.
  await grantCredits(
    userId,
    ngn * 100,
    "purchase",
    `Paystack top-up — ₦${ngn.toLocaleString("en-NG")}`,
    { paystackReference: reference },
    reference
  );

  return NextResponse.json({ ok: true });
}
