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
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in transaction status Edge Function",
  );
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
    if (!user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const body = await request.json();
    const transactionId = String(body.transaction_id || "").trim();
    if (!transactionId) {
      return new Response("Missing transaction_id", { status: 400, headers: corsHeaders });
    }

    const { data: transaction, error } = await supabaseAdmin
      .from("transactions")
      .select("id, user_id, amount, status, qr_code, qr_code_text, expires_at")
      .eq("id", transactionId)
      .maybeSingle();

    if (error) {
      console.error("Transaction lookup failed", error);
      return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
    }

    if (!transaction) {
      return new Response("Transaction not found", { status: 404, headers: corsHeaders });
    }

    if (transaction.user_id !== user.id) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({
        transaction_id: transaction.id,
        amount: Number(transaction.amount),
        qrCode: transaction.qr_code,
        qrCodeText: transaction.qr_code_text,
        expirationDate: transaction.expires_at,
        status: transaction.status,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("Transaction status error", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});
