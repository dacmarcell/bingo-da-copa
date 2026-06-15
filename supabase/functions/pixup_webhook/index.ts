import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in webhook Edge Function");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
serve(async (request: any) => {
  if (request.method !== "POST") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error("Webhook signature verification failed", error);
    return new Response("Invalid webhook signature", { status: 401, headers: corsHeaders });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error("Invalid webhook JSON", error);
    return new Response("Bad request", { status: 400, headers: corsHeaders });
  }

  const eventId = String(payload.id ?? payload.event_id ?? payload.webhook_id ?? "").trim() || null;
  const data = payload.data ?? payload;
  const externalId = String(data.external_id ?? data.transaction_id ?? data.id ?? "").trim();
  const status = normalizeStatus(data.status ?? payload.status);

  if (!externalId) {
    console.error("Webhook missing external_id", payload);
    return new Response("Missing external_id", { status: 400, headers: corsHeaders });
  }

  if (!status) {
    console.error("Webhook unsupported status", payload);
    return new Response("Unsupported status", { status: 400, headers: corsHeaders });
  }

  if (eventId) {
    const { data: existingLog, error: existingError } = await supabaseAdmin
      .from("payment_audit_logs")
      .select("id")
      .eq("webhook_event_id", eventId)
      .limit(1)
      .single();

    if (existingError && existingError.code !== "PGRST116") {
      console.error("Webhook idempotency lookup failed", existingError);
      return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
    }

    if (existingLog) {
      console.log("Duplicate webhook event ignored", eventId);
      return new Response("Duplicate event", { status: 200, headers: corsHeaders });
    }
  }

  const { data: transaction, error: transactionError } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("id", externalId)
    .maybeSingle();

  if (transactionError) {
    console.error("Transaction lookup failed", transactionError);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }

  if (!transaction) {
    console.error("Transaction not found", externalId);
    return new Response("Transaction not found", { status: 404, headers: corsHeaders });
  }

  if (transaction.status === "PAID" && status === "PAID") {
    await logAudit(transaction.id, "WEBHOOK_IGNORED_ALREADY_PAID", payload, eventId || undefined);
    return new Response("Already processed", { status: 200, headers: corsHeaders });
  }

  const now = new Date();
  const updates: Record<string, unknown> = {
    status,
    updated_at: now.toISOString(),
  };

  if (status === "PAID") {
    updates.paid_at = now.toISOString();
    updates.expires_at = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  if (data.id) {
    updates.pixup_charge_id = String(data.id);
  }

  const { error: updateError } = await supabaseAdmin
    .from("transactions")
    .update(updates)
    .eq("id", transaction.id);

  if (updateError) {
    console.error("Transaction update failed", updateError);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }

  await logAudit(transaction.id, `WEBHOOK_${status}`, payload, eventId || undefined);

  if (status === "PAID") {
    const startsAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: subError } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: transaction.user_id,
        active: true,
        status: "active",
        starts_at: startsAt,
        expires_at: expiresAt,
        paid_at: startsAt,
      },
      { onConflict: "user_id" },
    );

    if (subError) {
      console.error("Subscription activation failed", subError);
      return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
    }

    await logAudit(
      transaction.id,
      "SUBSCRIPTION_ACTIVATED",
      {
        user_id: transaction.user_id,
        starts_at: startsAt,
        expires_at: expiresAt,
      },
      eventId || undefined,
    );
  }

  return new Response("Webhook processed", { status: 200, headers: corsHeaders });
});
