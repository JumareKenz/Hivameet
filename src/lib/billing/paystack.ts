// Paystack integration, following the same pattern already used elsewhere
// in the Hiva platform (chatbot_platform's HIU ledger — see
// app/services/payment_client.py and app/api/v1/billing.py there):
// hosted Initialize Transaction checkout, HMAC-SHA512 webhook verification,
// credit only on a verified charge.success whose metadata we set ourselves.
//
// Only ever sell the fixed CREDIT_PACKAGES list — never an arbitrary
// caller-supplied amount, since Paystack charges exactly what we tell it to.

import { randomUUID } from "node:crypto";
import { CREDIT_PACKAGES } from "./pricing";

export class PaystackNotConfiguredError extends Error {
  constructor() {
    super(
      "Payments aren't connected yet. Set PAYSTACK_SECRET_KEY in .env.local " +
        "to enable real credit purchases."
    );
    this.name = "PaystackNotConfiguredError";
  }
}

interface InitiateCheckoutParams {
  userId: string;
  email: string;
  ngn: number;
  callbackUrl: string;
}

export async function initiatePaystackCheckout({
  userId,
  email,
  ngn,
  callbackUrl,
}: InitiateCheckoutParams): Promise<string> {
  const pkg = CREDIT_PACKAGES.find((p) => p.ngn === ngn);
  if (!pkg) throw new Error(`${ngn} is not a valid self-serve credit package`);

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new PaystackNotConfiguredError();

  const reference = `hivameet-topup-${randomUUID()}`;

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      // Paystack's `amount` is in the smallest currency unit — kobo for
      // NGN, which is exactly how we store balances internally.
      amount: pkg.ngn * 100,
      currency: "NGN",
      reference,
      metadata: { userId, ngn: pkg.ngn },
      callback_url: callbackUrl,
    }),
  });

  if (!res.ok) {
    throw new Error(`Paystack transaction initialization failed (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  if (!body.status) {
    throw new Error(`Paystack transaction initialization failed: ${body.message}`);
  }
  return body.data.authorization_url as string;
}
