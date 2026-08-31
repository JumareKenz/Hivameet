import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CREDIT_PACKAGES } from "@/lib/billing/pricing";
import { initiatePaystackCheckout, PaystackNotConfiguredError } from "@/lib/billing/paystack";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ngn } = await req.json();
  if (!CREDIT_PACKAGES.some((p) => p.ngn === ngn)) {
    return NextResponse.json({ error: "Invalid package" }, { status: 400 });
  }

  const baseUrl = process.env.APP_BASE_URL ?? new URL(req.url).origin;

  try {
    const authorizationUrl = await initiatePaystackCheckout({
      userId: session.user.id,
      email: session.user.email,
      ngn,
      callbackUrl: `${baseUrl}/billing`,
    });
    return NextResponse.json({ authorizationUrl });
  } catch (err) {
    if (err instanceof PaystackNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 424 });
    }
    console.error(err);
    return NextResponse.json({ error: "Couldn't start checkout" }, { status: 502 });
  }
}
