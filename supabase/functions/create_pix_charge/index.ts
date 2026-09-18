import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, getAuthenticatedUser, jsonResponse, textResponse } from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PIXUP_CLIENT_ID = Deno.env.get("PIXUP_CLIENT_ID");
const PIXUP_CLIENT_SECRET = Deno.env.get("PIXUP_CLIENT_SECRET");
const WEBHOOK_URL = Deno.env.get("WEBHOOK_URL");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !PIXUP_CLIENT_ID ||
  !PIXUP_CLIENT_SECRET ||
  !WEBHOOK_URL ||
  !WEBHOOK_SECRET
) {
  throw new Error("Missing required environment variables for Pixup Edge Function");
}

// The price is decided here, never by the client.
const PREMIUM_PRICE = 4.9;
const PREMIUM_DESCRIPTION = "Assinatura Premium";
const MAX_CHARGES_PER_HOUR = 5;

// The webhook has no JWT, so its URL carries a shared secret that pixup_webhook verifies.
const POSTBACK_URL = (() => {
  const url = new URL(WEBHOOK_URL);
  url.searchParams.set("token", WEBHOOK_SECRET);
  return url.toString();
})();

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function getCachedPixupAccessToken() {
  const { data, error } = await supabaseAdmin
    .from("pixup_tokens")
    .select("*")
    .order("expires_at", { ascending: false })
    .limit(1)
    .single();

  if (!error && data?.expires_at && new Date(data.expires_at) > new Date()) {
    return data.access_token as string;
  }

  const credentials = `${PIXUP_CLIENT_ID}:${PIXUP_CLIENT_SECRET}`;
  const base64Credentials = btoa(credentials);

  const tokenResponse = await fetch("https://api.pixupbr.com/v2/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64Credentials}`,
      "Content-Type": "application/json",
    },
  });

  const tokenPayload = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenPayload.access_token) {
    // Never include the gateway response: it can echo credentials
    throw new Error(`Failed to obtain Pixup token (HTTP ${tokenResponse.status})`);
  }

  const expiresIn = Number(tokenPayload.expires_in ?? 3600);
  const expiresAt = new Date(Date.now() + expiresIn * 1000 - 30_000).toISOString();

  await supabaseAdmin.from("pixup_tokens").insert({
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token ?? null,
    scope: tokenPayload.scope ?? null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  return tokenPayload.access_token as string;
}

async function createPixupCharge(transactionId: string, user: { email?: string }) {
  const accessToken = await getCachedPixupAccessToken();

  const payload = {
    amount: PREMIUM_PRICE,
    description: PREMIUM_DESCRIPTION,
    external_id: transactionId,
    postbackUrl: POSTBACK_URL,
    payer: {
      name: user.email ?? "Torcedor",
      document: "00000000000",
    },
  };

  const response = await fetch("https://api.pixupbr.com/v2/pix/qrcode", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json();

  if (!response.ok) {
    throw new Error(
      `Pixup charge creation failed: ${responseBody?.message ?? response.statusText}`,
    );
  }

  return responseBody;
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

serve(async (request: Request) => {
  const cors = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (request.method !== "POST") {
    return textResponse("Method Not Allowed", 405, cors);
  }

  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) {
      return textResponse("Unauthorized", 401, cors);
    }

    // Reuse a still-valid pending charge instead of creating (and paying the gateway for) another
    const { data: pending } = await supabaseAdmin
      .from("transactions")
      .select("id, amount, qr_code, expires_at")
      .eq("user_id", user.id)
      .eq("status", "PENDING")
      .not("qr_code", "is", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pending) {
      return jsonResponse(
        {
          transaction_id: pending.id,
          amount: Number(pending.amount),
          qrCode: pending.qr_code,
          expirationDate: pending.expires_at,
          status: "PENDING",
        },
        200,
        cors,
      );
    }

    const { count: recentCount, error: countError } = await supabaseAdmin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if (countError) {
      console.error("Rate limit lookup failed", countError);
      return textResponse("Internal Server Error", 500, cors);
    }
    if ((recentCount ?? 0) >= MAX_CHARGES_PER_HOUR) {
      return textResponse("Too many requests", 429, cors);
    }

    const transactionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin.from("transactions").insert({
      id: transactionId,
      user_id: user.id,
      amount: PREMIUM_PRICE,
      status: "PENDING",
      gateway: "pixup",
      created_at: now,
      updated_at: now,
      external_id: transactionId,
    });

    if (insertError) {
      console.error("Transaction create failed", insertError);
      // Don't leak detailed error information to client
      return textResponse("Unable to create transaction", 500, cors);
    }

    await logAudit(transactionId, "TRANSACTION_CREATED", {
      user_id: user.id,
      amount: PREMIUM_PRICE,
      description: PREMIUM_DESCRIPTION,
    });

    const chargePayload = await createPixupCharge(transactionId, user);

    const qrCode = chargePayload.qrcode || null;
    const expiresAt = new Date(
      Date.now() + Number(chargePayload.calendar?.expiration ?? 3600) * 1000,
    );
    const chargeId = chargePayload.transactionId || null;

    const { error: updateError } = await supabaseAdmin
      .from("transactions")
      .update({
        qr_code: qrCode,
        expires_at: expiresAt,
        pixup_charge_id: chargeId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId);

    if (updateError) {
      console.error("Transaction update failed", updateError);
      // Don't leak detailed error information to client
      return textResponse("Unable to update transaction", 500, cors);
    }

    await logAudit(transactionId, "PIXUP_CHARGE_CREATED", chargePayload);

    return jsonResponse(
      {
        transaction_id: transactionId,
        amount: PREMIUM_PRICE,
        qrCode,
        expirationDate: expiresAt,
        status: "PENDING",
      },
      200,
      cors,
    );
  } catch (error) {
    console.error("Create Pix charge error", error);
    return textResponse("Internal Server Error", 500, cors);
  }
});
