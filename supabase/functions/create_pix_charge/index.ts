import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PIXUP_CLIENT_ID = Deno.env.get("PIXUP_CLIENT_ID");
const PIXUP_CLIENT_SECRET = Deno.env.get("PIXUP_CLIENT_SECRET");
const WEBHOOK_URL =
  Deno.env.get("WEBHOOK_URL") ||
  "https://heemixrmovdrmajwebzv.supabase.co/functions/v1/pixup_webhook";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [
  "https://heemixrmovdrmajwebzv.supabase.co",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PIXUP_CLIENT_ID || !PIXUP_CLIENT_SECRET) {
  throw new Error("Missing required environment variables for Pixup Edge Function");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("Authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "");

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    console.error(error);
    return null;
  }

  return data.user;
}

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
    throw new Error(`Failed to obtain Pixup token: ${JSON.stringify(tokenPayload)}`);
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

async function createPixupCharge(
  transactionId: string,
  amount: number,
  description: string,
  user: { email: string },
) {
  const accessToken = await getCachedPixupAccessToken();

  const payload = {
    amount,
    description,
    external_id: transactionId,
    postbackUrl: WEBHOOK_URL,
    payer: {
      name: user.email,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
serve(async (request: any) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const body = await request.json();
    const amount = Number(body.amount);
    const description = String(body.description ?? "Assinatura Premium").trim();

    // Validate amount
    if (!amount || amount <= 0 || amount > 10000) {
      return new Response("Invalid amount", { status: 400, headers: corsHeaders });
    }

    // Validate description length
    if (description.length > 200) {
      return new Response("Description too long", { status: 400, headers: corsHeaders });
    }

    const transactionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin.from("transactions").insert({
      id: transactionId,
      user_id: user.id,
      amount,
      status: "PENDING",
      gateway: "pixup",
      created_at: now,
      updated_at: now,
      external_id: transactionId,
    });

    if (insertError) {
      console.error("Transaction create failed", insertError);
      // Don't leak detailed error information to client
      return new Response("Unable to create transaction", { status: 500, headers: corsHeaders });
    }

    await logAudit(transactionId, "TRANSACTION_CREATED", {
      user_id: user.id,
      amount,
      description,
    });

    const chargePayload = await createPixupCharge(transactionId, amount, description, user);

    const qrCode = chargePayload.qrcode || null;
    const expiresAt = new Date(Date.now() + chargePayload.calendar.expiration * 1000);
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
      return new Response("Unable to update transaction", { status: 500, headers: corsHeaders });
    }

    await logAudit(transactionId, "PIXUP_CHARGE_CREATED", chargePayload);

    return new Response(
      JSON.stringify({
        transaction_id: transactionId,
        amount,
        qrCode,
        expirationDate: expiresAt,
        status: "PENDING",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (error) {
    console.error("Create Pix charge error", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});
