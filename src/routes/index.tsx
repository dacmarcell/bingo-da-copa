import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { genRoomCode, generateCard } from "@/lib/bingo";
import { THEMES, type ThemeKey } from "@/lib/bingo-events";
import { toast } from "sonner";
import { AdsenseBanner } from "@/components/AdsenseBanner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bingo da Copa - Jogue bingo durante as partidas" },
      {
        name: "description",
        content:
          "Crie salas, convide amigos e marque eventos do jogo e do churrasco em tempo real.",
      },
    ],
  }),
  component: Home,
});

type Match = {
  id: string;
  team_a: string;
  team_b: string;
  team_a_code: string;
  team_b_code: string;
  competition: string;
  starts_at: string;
  status: "scheduled" | "live" | "finished";
  score_a: number;
  score_b: number;
};
type Room = {
  id: string;
  code: string;
  name: string;
  status: "waiting" | "in_progress" | "finished";
  match_id: string;
  theme: ThemeKey;
  creator_id: string;
};

function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<Match[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [participantCounts, setCounts] = useState<Record<string, number>>({});
  const [openModal, setOpenModal] = useState<Match | null>(null);

  useEffect(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    supabase
      .from("matches")
      .select("*")
      .gte("starts_at", todayStart.toISOString())
      .neq("status", "finished")
      .order("starts_at", { ascending: true })
      .limit(3)
      .then(({ data }) => setMatches((data ?? []) as Match[]));

    supabase
      .from("rooms")
      .select("*")
      .neq("status", "finished")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(async ({ data }) => {
        setRooms((data ?? []) as Room[]);
        if (data && data.length) {
          const { data: rp } = await supabase
            .from("room_participants")
            .select("room_id")
            .in(
              "room_id",
              data.map((r) => r.id),
            );
          const counts: Record<string, number> = {};
          (rp ?? []).forEach((r: { room_id: string }) => {
            counts[r.room_id] = (counts[r.room_id] ?? 0) + 1;
          });
          setCounts(counts);
        }
      });
  }, []);

  async function createRoom(match: Match, theme: ThemeKey) {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (THEMES[theme].premium) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("active,expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      const active = sub?.active && (!sub.expires_at || new Date(sub.expires_at) > new Date());
      if (!active) {
        toast.error("Tema Premium - assine por R$ 4,90 para liberar");
        return;
      }
    }
    const code = genRoomCode();
    const name = `Sala ${match.team_a_code} x ${match.team_b_code}`;
    const { data: room, error } = await supabase
      .from("rooms")
      .insert({
        code,
        name,
        match_id: match.id,
        creator_id: user.id,
        theme,
      })
      .select()
      .single();
    if (error || !room) {
      toast.error("Erro ao criar sala");
      return;
    }
    // Auto-join + cartela
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    await supabase.from("room_participants").insert({
      room_id: room.id,
      user_id: user.id,
      display_name: profile?.display_name ?? "Torcedor",
    });
    await supabase.from("cards").insert({
      room_id: room.id,
      user_id: user.id,
      cells: generateCard(theme),
    });
    navigate({ to: "/sala/$code", params: { code } });
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 max-w-md mx-auto pb-24">
      <Header />

      {/* Hero */}
      <section className="mb-8">
        <h2 className="font-display text-4xl uppercase leading-none tracking-tight">
          Marque
          <br />
          os <span className="text-primary">eventos</span>
          <br />
          do jogo.
        </h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-[32ch]">
          Cartelas únicas, ranking ao vivo e bingo coletivo durante a transmissão.
        </p>
      </section>

      {/* Matches */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
            Próximas partidas
          </h3>
          <Link
            to="/matches"
            className="font-mono text-[10px] uppercase text-primary hover:underline"
          >
            Ver todas
          </Link>
        </div>
        <div className="space-y-2">
          {matches.map((m) => (
            <button
              key={m.id}
              onClick={() => setOpenModal(m)}
              className="w-full bg-card border border-border p-3 flex justify-between items-center group hover:border-primary/40 transition-colors text-left hover:cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(m.starts_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-bold text-sm tracking-tight">
                  {m.team_a_code} × {m.team_b_code}
                </span>
              </div>
              <span className="font-mono text-[10px] text-primary group-hover:translate-x-1 transition-transform">
                → CRIAR SALA
              </span>
            </button>
          ))}
          {!matches.length && (
            <p className="text-xs text-muted-foreground italic">
              Nenhuma partida cadastrada para hoje ou depois.
            </p>
          )}
        </div>
      </section>

      {/* Open rooms */}
      <section className="mb-10">
        <h3 className="font-mono text-[10px] text-muted-foreground uppercase mb-3 tracking-widest">
          Salas abertas
        </h3>
        <div className="space-y-2">
          {rooms.map((r) => (
            <Link
              key={r.id}
              to="/sala/$code"
              params={{ code: r.code }}
              className="bg-card border border-border p-3 flex justify-between items-center group hover:border-primary/40 transition-colors"
            >
              <div>
                <p className="font-bold text-sm tracking-tight">{r.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground uppercase">
                  {THEMES[r.theme].label} · {participantCounts[r.id] ?? 0} jogadores ·{" "}
                  {r.status === "waiting" ? "Aguardando" : "Em andamento"}
                </p>
              </div>
              <span className="font-mono text-[10px] text-primary">→ ENTRAR</span>
            </Link>
          ))}
          {!rooms.length && (
            <p className="text-xs text-muted-foreground italic">
              Nenhuma sala aberta. Crie a primeira!
            </p>
          )}
        </div>
      </section>

      {/* Premium upsell */}
      <div className="bg-linear-to-br from-orange-500 to-red-600 p-4 mb-8 shadow-2xl shadow-orange-500/20">
        <div className="flex justify-between items-start gap-2">
          <div>
            <h3 className="font-display text-2xl uppercase italic tracking-tighter text-white">
              PREMIUM PASS
            </h3>
            <p className="text-xs font-bold text-white/90 mb-4">
              Sem anúncios + temas exclusivos: Churrasco & Família
            </p>
            <Link
              to="/premium"
              className="inline-block bg-white text-black font-display px-6 py-2 text-sm uppercase tracking-widest hover:bg-white/90"
            >
              ASSINAR R$ 4,90
            </Link>
          </div>
          <div className="size-16 bg-black/20 rounded-full flex items-center justify-center shrink-0">
            <span className="text-3xl rotate-12">🥩</span>
          </div>
        </div>
      </div>

      {/* Adsense placeholder */}
      <div className="h-20 border border-dashed border-border flex items-center justify-center mb-4">
        <span className="font-mono text-[10px] text-muted-foreground uppercase">
          <AdsenseBanner />
        </span>
      </div>

      {/* Create room modal */}
      {openModal && (
        <CreateRoomModal
          match={openModal}
          onClose={() => setOpenModal(null)}
          onCreate={(theme) => createRoom(openModal, theme)}
        />
      )}
    </div>
  );
}

function CreateRoomModal({
  match,
  onClose,
  onCreate,
}: {
  match: Match;
  onClose: () => void;
  onCreate: (t: ThemeKey) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          Nova sala
        </p>
        <h3 className="font-display text-2xl uppercase tracking-tight mb-4">
          {match.team_a_code} × {match.team_b_code}
        </h3>
        <p className="font-mono text-[10px] text-muted-foreground uppercase mb-2">
          Escolha o tema da cartela
        </p>
        <div className="space-y-2">
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
            const t = THEMES[key];
            return (
              <button
                key={key}
                onClick={() => onCreate(key)}
                className="w-full text-left bg-background border border-border p-3 hover:border-primary/40 flex justify-between items-center"
              >
                <span className="font-bold text-sm">{t.label}</span>
                {t.premium && <span className="font-mono text-[10px] text-primary">PREMIUM</span>}
              </button>
            );
          })}
        </div>
        <button
          onClick={onClose}
          className="mt-4 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
