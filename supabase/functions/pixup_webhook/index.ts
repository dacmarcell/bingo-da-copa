import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Server-to-server endpoint: no CORS headers on purpose. It must be deployed without JWT
// verification (see supabase/config.toml) and is authenticated by the shared secret that
// create_pix_charge appends to the postback URL (?token=...).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WEBHOOK_SECRET) {
  throw new Error(
    "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or WEBHOOK_SECRET in webhook Edge Function",
  );
}

const MAX_BODY_BYTES = 100_000;
const SUBSCRIPTION_DAYS = 30;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Compares SHA-256 digests so neither the content nor the length of the secret leaks via timing
async function secretMatches(provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(WEBHOOK_SECRET!)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function logAudit(
  transactionId: string,
  event: string,
  payload: unknown,
  webhookEventId?: string,
) {
  await supabaseAdmin.from("payment_audit_logs").insert({
    transaction_id: transactionId,
    event,
    payload: payload as Record<string, unknown>,
    webhook_event_id: webhookEventId ?? null,
  });
}

function normalizeStatus(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase();
  if (["PAID", "EXPIRED", "CANCELLED", "REFUNDED", "FAILED"].includes(normalized)) {
    return normalized;
  }
  return null;
}

// PENDING may move anywhere; a payment that arrives after expiry/failure is still a payment;
// a PAID transaction can only be refunded, never downgraded to EXPIRED/FAILED/...
function isAllowedTransition(from: string, to: string) {
  if (from === to) return false;
  if (from === "PENDING") return true;
  if (to === "PAID") return ["EXPIRED", "CANCELLED", "FAILED"].includes(from);
  if (from === "PAID") return to === "REFUNDED";
  return false;
}

async function activateSubscription(transaction: { id: string; user_id: string }, paidAt: string) {
  const expiresAt = new Date(
    new Date(paidAt).getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Same values on every call for the same payment, so retries are harmless
  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: transaction.user_id,
      active: true,
      status: "active",
      starts_at: paidAt,
      expires_at: expiresAt,
      paid_at: paidAt,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;

  return expiresAt;
}

serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!(await secretMatches(new URL(request.url).searchParams.get("token")))) {
    console.error("Webhook rejected: invalid token");
    return new Response("Unauthorized", { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error("Webhook body read failed", error);
    return new Response("Bad request", { status: 400 });
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error("Invalid webhook JSON", error);
    return new Response("Bad request", { status: 400 });
  }
  if (payload === null || typeof payload !== "object") {
    return new Response("Bad request", { status: 400 });
  }

  const eventId = String(payload.id ?? payload.event_id ?? payload.webhook_id ?? "").trim() || null;
  const data = payload.data ?? payload;
  const externalId = String(data.external_id ?? data.transaction_id ?? data.id ?? "").trim();
  const status = normalizeStatus(data.status ?? payload.status);

  if (!externalId) {
    console.error("Webhook missing external_id");
    return new Response("Missing external_id", { status: 400 });
  }

  if (!status) {
    console.error("Webhook unsupported status");
    return new Response("Unsupported status", { status: 400 });
  }

  if (eventId) {
    const { data: existingLog, error: existingError } = await supabaseAdmin
      .from("payment_audit_logs")
      .select("id")
      .eq("webhook_event_id", eventId)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error("Webhook idempotency lookup failed", existingError);
      return new Response("Internal Server Error", { status: 500 });
    }

    if (existingLog) {
      return new Response("Duplicate event", { status: 200 });
    }
  }

  const { data: transaction, error: transactionError } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("id", externalId)
    .maybeSingle();

  if (transactionError) {
    console.error("Transaction lookup failed", transactionError);
    return new Response("Internal Server Error", { status: 500 });
  }

  if (!transaction) {
    console.error("Transaction not found", externalId);
    return new Response("Transaction not found", { status: 404 });
  }

  // If the gateway reports an amount, it must match what we charged
  const reportedAmount = data.amount ?? data.value;
  if (
    status === "PAID" &&
    reportedAmount !== undefined &&
    reportedAmount !== null &&
    Math.abs(Number(reportedAmount) - Number(transaction.amount)) > 0.009
  ) {
    console.error("Webhook amount mismatch", transaction.id);
    await logAudit(transaction.id, "WEBHOOK_AMOUNT_MISMATCH", payload);
    return new Response("Amount mismatch", { status: 400 });
  }

  const now = new Date();
  let current = transaction;

  if (isAllowedTransition(transaction.status, status)) {
    const updates: Record<string, unknown> = {
      status,
      updated_at: now.toISOString(),
    };
    if (status === "PAID") {
      updates.paid_at = now.toISOString();
      updates.expires_at = new Date(
        now.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
    }
    if (data.id && !transaction.pixup_charge_id) {
      updates.pixup_charge_id = String(data.id);
    }

    // Compare-and-set on the previous status: concurrent deliveries can't both win
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("transactions")
      .update(updates)
      .eq("id", transaction.id)
      .eq("status", transaction.status)
      .select("*")
      .maybeSingle();

    if (updateError) {
      console.error("Transaction update failed", updateError);
      return new Response("Internal Server Error", { status: 500 });
    }
    if (updated) {
      current = updated;
      await logAudit(transaction.id, `WEBHOOK_${status}`, payload);
    }
  } else {
    await logAudit(transaction.id, `WEBHOOK_IGNORED_${status}`, payload);
  }

  // Activation is idempotent and runs for every PAID delivery, so a failure after the
  // transaction was marked PAID is repaired by the gateway's retry instead of being lost.
  if (status === "PAID" && current.status === "PAID" && current.paid_at) {
    try {
      const expiresAt = await activateSubscription(current, current.paid_at);
      await logAudit(transaction.id, "SUBSCRIPTION_ACTIVATED", {
        user_id: current.user_id,
        starts_at: current.paid_at,
        expires_at: expiresAt,
      });
    } catch (error) {
      console.error("Subscription activation failed", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  // Refunded payment -> revoke the subscription that this payment bought
  if (status === "REFUNDED" && current.status === "REFUNDED" && transaction.paid_at) {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ active: false, status: "refunded" })
      .eq("user_id", current.user_id)
      .eq("paid_at", transaction.paid_at);
    if (error) {
      console.error("Subscription revocation failed", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  // Only now is the event marked as seen: a failure above must stay retryable
  if (eventId) {
    await logAudit(transaction.id, "WEBHOOK_PROCESSED", { status }, eventId);
  }

  return new Response("Webhook processed", { status: 200 });
});
