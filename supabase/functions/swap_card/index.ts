import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [
  "https://heemixrmovdrmajwebzv.supabase.co",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
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

// Generate a new card with the given theme
function generateCard(theme: string) {
  // Import event pools based on theme
  const CLASSIC_EVENTS = [
    "Gol",
    "Cartão amarelo",
    "Cartão vermelho",
    "Escanteio",
    "Impedimento",
    "Pênalti",
    "Chute na trave",
    "Acréscimos no 2º tempo",
    "VAR",
    "Alguém xinga o juiz",
    "Levantou do sofá pra reclamar",
    "Comentarista interrompe",
    "Narrador cita jogo antigo",
    "Close em torcedor chorando",
    "Casal aparece no telão",
    "Criança fantasiada",
    "Torcedor pintado",
    "Celebridade aparece",
    "Torcedor nervoso",
    "Substituição",
    "Erro de passe",
    "Falta perigosa",
    "Goleiro defende",
    "Bola na lateral",
    "Lance polêmico",
  ];

  const CHURRASCO_EVENTS = [
    "Carne queimou",
    "Acabou o gelo",
    "Xingou o juiz",
    "Derrubaram cerveja",
    "Discussão sobre impedimento",
    "Pessoa chegou atrasada",
    "Falou do 7x1",
    "Pediu mais pão de alho",
    "Esqueceu de trazer algo",
    "Criança correndo",
    "Reclamou do preço da carne",
    "Dormiu na cadeira",
    "Acabou o carvão",
    "Falou de política",
    "Perguntou regra do impedimento",
    "Derrubou comida",
    "Comemorou antes da hora",
    "Reclamação do VAR",
    "Reclamou dos jogadores atuais",
    "Citou Pelé",
    "Citou Maradona",
    "Pediu o sal",
    "Trocou a música",
    "Chegou mais gente",
    "Acabou a cerveja",
  ];

  const FAMILIA_EVENTS = [
    "Reclama do técnico",
    "Antigamente era melhor",
    "Chegou no meio do jogo",
    "Não entende as regras",
    "Pergunta o placar",
    "Torce para outro país",
    "Discute melhor jogador",
    "Fala do Pelé",
    "Pergunta se saiu a carne",
    "Vai à cozinha no melhor lance",
    "Pede refrigerante",
    "Acaba o petisco",
    "Reclama da comida",
    "Aparece com prato cheio",
    "Pergunta da sobremesa",
    "Derruba comida",
    "Volta da cozinha e pergunta",
    "Pede o controle remoto",
    "Aumenta o volume",
    "Reclama do volume",
    "Criança muda o canal",
    "Bloqueia a visão da TV",
    "Mexe na internet",
    "Atende o telefone alto",
    "Tira foto da TV",
  ];

  let pool: string[];
  switch (theme) {
    case "churrasco":
      pool = [...CHURRASCO_EVENTS];
      break;
    case "familia":
      pool = [...FAMILIA_EVENTS];
      break;
    default:
      pool = [...CLASSIC_EVENTS];
  }

  // Shuffle the pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Generate 25 cells
  const cells = Array.from({ length: 25 }, (_, i) => {
    if (i === 12) return { event: "FREE", marked: true, free: true };
    return { event: pool[i % pool.length], marked: false };
  });

  return cells;
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const roomId = body.room_id;

    if (!roomId) {
      return new Response("room_id is required", { status: 400, headers: corsHeaders });
    }

    // Validate room_id is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(roomId)) {
      return new Response("Invalid room_id format", { status: 400, headers: corsHeaders });
    }

    // Check if user has active subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("active, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      console.error("Subscription check failed", subError);
      return new Response("Error checking subscription", { status: 500, headers: corsHeaders });
    }

    const isActive =
      subscription?.active &&
      (!subscription.expires_at || new Date(subscription.expires_at) > new Date());
    if (!isActive) {
      return new Response("Premium subscription required to swap cards", {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Get room details to check theme
    const { data: room, error: roomError } = await supabaseAdmin
      .from("rooms")
      .select("theme, status")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return new Response("Room not found", { status: 404, headers: corsHeaders });
    }

    if (room.status === "finished") {
      return new Response("Cannot swap card in finished room", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Check current swap count for this user in this room
    const { data: participant, error: participantError } = await supabaseAdmin
      .from("room_participants")
      .select("swaps_count")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();

    if (participantError || !participant) {
      return new Response("Participant not found", { status: 404, headers: corsHeaders });
    }

    const currentSwaps = participant.swaps_count || 0;
    if (currentSwaps >= 3) {
      return new Response("Maximum of 3 card swaps per room reached", {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Generate new card
    const newCells = generateCard(room.theme);

    // Update card in database
    const { error: cardError } = await supabaseAdmin
      .from("cards")
      .update({ cells: newCells })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    if (cardError) {
      console.error("Card update failed", cardError);
      // Don't leak detailed error information to client
      return new Response("Error updating card", { status: 500, headers: corsHeaders });
    }

    // Increment swap count
    const { error: swapCountError } = await supabaseAdmin
      .from("room_participants")
      .update({ swaps_count: currentSwaps + 1 })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    if (swapCountError) {
      console.error("Swap count update failed", swapCountError);
      // Don't leak detailed error information to client
      return new Response("Error updating swap count", { status: 500, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({
        success: true,
        cells: newCells,
        swaps_remaining: 3 - (currentSwaps + 1),
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
    console.error("Swap card error", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});
