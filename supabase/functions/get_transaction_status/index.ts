import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  UUID_RE,
  corsHeaders,
  getAuthenticatedUser,
  jsonResponse,
  textResponse,
} from "../_shared/http.ts";

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
    if (!user) {
      return textResponse("Unauthorized", 401, cors);
    }

    const body = await request.json().catch(() => null);
    const transactionId = String(body?.transaction_id ?? "").trim();
    if (!UUID_RE.test(transactionId)) {
      return textResponse("Invalid transaction_id", 400, cors);
    }

    // Filtering by user_id means other people's transactions look like "not found"
    const { data: transaction, error } = await supabaseAdmin
      .from("transactions")
      .select("id, amount, status, qr_code, expires_at")
      .eq("id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Transaction lookup failed", error);
      return textResponse("Internal Server Error", 500, cors);
    }

    if (!transaction) {
      return textResponse("Transaction not found", 404, cors);
    }

    return jsonResponse(
      {
        transaction_id: transaction.id,
        amount: Number(transaction.amount),
        qrCode: transaction.qr_code,
        expirationDate: transaction.expires_at,
        status: transaction.status,
      },
      200,
      cors,
    );
  } catch (error) {
    console.error("Transaction status error", error);
    return textResponse("Internal Server Error", 500, cors);
  }
});
