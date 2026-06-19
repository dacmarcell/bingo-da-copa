import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { computeScore, generateCard, type Cell } from "@/lib/bingo";
import { THEMES, type ThemeKey } from "@/lib/bingo-events";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/sala/$code")({
  head: () => ({ meta: [{ title: "Sala - Bingo da Copa" }] }),
  component: RoomPage,
});

type Room = {
  id: string;
  code: string;
  name: string;
  status: "waiting" | "in_progress" | "finished";
  match_id: string;
  theme: ThemeKey;
  creator_id: string;
};
type Match = {
  team_a: string;
  team_b: string;
  team_a_code: string;
  team_b_code: string;
  status: string;
  score_a: number;
  score_b: number;
};
type Participant = {
  id: string;
  user_id: string;
  display_name: string;
  score: number;
  marks_count: number;
  bingos: number;
  swaps_count?: number;
};

function RoomPage() {
  const { code } = Route.useParams();
  const { user, displayName, loading: authLoading, isSubscriber } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [confetti, setConfetti] = useState(false);
  const [bingoCount, setBingoCount] = useState(0);
  const [swapsCount, setSwapsCount] = useState(0);
  const [swapping, setSwapping] = useState(false);

  // Load room
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate({
        to: "/auth",
        search: {
          redirect: window.location.pathname,
        },
      });
      return;
    }
    (async () => {
      const { data: r } = await supabase.from("rooms").select("*").eq("code", code).maybeSingle();
      if (!r) {
        toast.error("Sala não encontrada");
        navigate({ to: "/" });
        return;
      }
      setRoom(r as Room);
      const { data: m } = await supabase
        .from("matches")
        .select("*")
        .eq("id", r.match_id)
        .maybeSingle();
      setMatch(m as Match);

      // Join if not yet
      const { data: existing } = await supabase
        .from("room_participants")
        .select("*")
        .eq("room_id", r.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existing) {
        await supabase.from("room_participants").insert({
          room_id: r.id,
          user_id: user.id,
          display_name: displayName ?? "Torcedor",
          swaps_count: 0,
        });
      } else {
        // Load swaps_count from existing participant
        setSwapsCount((existing as any).swaps_count || 0);
      }
      // Card
      const { data: card } = await supabase
        .from("cards")
        .select("cells")
        .eq("room_id", r.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (card) setCells(card.cells as Cell[]);
      else {
        const newCells = generateCard(r.theme);
        await supabase.from("cards").insert({ room_id: r.id, user_id: user.id, cells: newCells });
        setCells(newCells);
      }
    })();
  }, [code, user, authLoading, displayName, navigate]);

  // Realtime participants/ranking
  useEffect(() => {
    if (!room) return;
    const load = async () => {
      const { data } = await supabase
        .from("room_participants")
        .select("*")
        .eq("room_id", room.id)
        .order("score", { ascending: false });

      setParticipants((data ?? []) as Participant[]);
    };
    load();
    const ch = supabase
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_participants",
          filter: `room_id=eq.${room.id}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (p) => setRoom(p.new as Room),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [room]);

  const toggleCell = useCallback(
    async (idx: number) => {
      if (!user || !room || room.status === "finished") return;
      if (cells[idx]?.free) return;
      const newCells = cells.map((c, i) => (i === idx ? { ...c, marked: !c.marked } : c));
      setCells(newCells);
      const { score, marks, lines, full } = computeScore(newCells);
      const newBingos = (lines > 0 ? 1 : 0) + (full ? 1 : 0);
      if (newBingos > bingoCount) {
        setConfetti(true);
        toast.success(full ? "🎉 CARTELA COMPLETA!" : "🎯 BINGO!");
        setTimeout(() => setConfetti(false), 2800);
      }
      setBingoCount(newBingos);
      await supabase
        .from("cards")
        .update({ cells: newCells })
        .eq("room_id", room.id)
        .eq("user_id", user.id);
      await supabase
        .from("room_participants")
        .update({ score, marks_count: marks, bingos: newBingos })
        .eq("room_id", room.id)
        .eq("user_id", user.id);
    },
    [cells, user, room, bingoCount],
  );

  async function endGame() {
    if (!room || !user || room.creator_id !== user.id) return;

    try {
      const finishedAt = new Date().toISOString();

      await supabase
        .from("rooms")
        .update({ status: "finished", finished_at: finishedAt })
        .eq("id", room.id);

      // Update local room state immediately so the UI displays the final ranking
      setRoom((r) => (r ? { ...r, status: "finished", finished_at: finishedAt } : r));

      // Fetch final ranking ordered by score descending
      const { data } = await supabase
        .from("room_participants")
        .select("*")
        .eq("room_id", room.id)
        .order("score", { ascending: false });
      setParticipants((data ?? []) as Participant[]);

      // celebration and UX niceties
      setConfetti(true);
      setTimeout(() => setConfetti(false), 3500);
      // scroll to top where the ranking is shown
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });

      toast.success("Bingo encerrado! Veja o ranking final.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao encerrar o bingo");
    }
  }

  async function swapCard() {
    if (!room || !user || swapping) return;

    setSwapping(true);
    try {
      const { data, error } = await supabase.functions.invoke("swap_card", {
        body: JSON.stringify({ room_id: room.id }),
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = data as { success: boolean; cells: Cell[]; swaps_remaining: number };

      if (result.success) {
        setCells(result.cells);
        setSwapsCount(swapsCount + 1);
        toast.success(`Cartela trocada! ${result.swaps_remaining} trocas restantes.`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erro ao trocar cartela";
      toast.error(errorMessage);
    } finally {
      setSwapping(false);
    }
  }

  function shareWhatsApp() {
    if (!room) return;
    const url = `${window.location.origin}/sala/${room.code}`;
    const text = encodeURIComponent(`Vem jogar Bingo da Copa comigo! Sala: ${room.name} - ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  function copyCode() {
    if (!room) return;
    navigator.clipboard.writeText(room.code);
    toast.success(`Código ${room.code} copiado`);
  }

  if (!room || !match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground uppercase">Carregando...</p>
      </div>
    );
  }

  const isCreator = user?.id === room.creator_id;
  const finished = room.status === "finished";

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 max-w-md mx-auto pb-32 relative">
      {confetti && <Confetti />}
      <Header subtitle={`Sala: ${room.name}`} />

      {/* Match status */}
      <div className="flex items-center justify-between mb-4 bg-card border border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {room.status !== "finished" && (
            <span className="size-2 bg-destructive rounded-full animate-pulse" />
          )}
          <span className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest">
            {finished ? "Encerrada" : "Ao vivo"}
          </span>
        </div>
        <span className="font-display text-sm tracking-wider">
          {match.team_a_code} {match.score_a}-{match.score_b} {match.team_b_code}
        </span>
      </div>

      {/* Share */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={copyCode}
          className="flex-1 bg-card border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-primary/40"
        >
          Código: <span className="text-primary">{room.code}</span>
        </button>
        <button
          onClick={shareWhatsApp}
          className="bg-accent text-accent-foreground px-3 py-2 font-mono text-[10px] uppercase tracking-widest font-bold hover:cursor-pointer"
        >
          WhatsApp
        </button>
      </div>

      {/* Ranking rail */}
      <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar mb-4">
        {participants.map((p, i) => (
          <div
            key={p.id}
            className={`flex-none flex items-center gap-2 px-3 py-2 rounded-xs ${
              p.user_id === user?.id
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border"
            } ${i === 0 && p.user_id !== user?.id ? "animate-rank-update" : ""}`}
          >
            <span className="font-mono text-[10px] font-bold">{i + 1}º</span>
            <span className="text-xs font-bold uppercase">
              {p.user_id === user?.id ? "VOCÊ" : p.display_name}
            </span>
            <span className="font-mono text-xs font-black">{p.score} pts</span>
          </div>
        ))}
      </div>

      {/* Bingo grid */}
      <div className="grid grid-cols-5 gap-1.5 mb-8">
        {cells.map((cell, i) => (
          <button
            key={i}
            onClick={() => toggleCell(i)}
            disabled={finished || cell.free}
            className={`aspect-square border p-1.5 relative overflow-hidden text-left transition-transform active:scale-95 ${
              cell.free
                ? "bg-accent/20 border-2 border-primary flex flex-col items-center justify-center"
                : "bg-card border-border hover:border-primary/40"
            }`}
          >
            {cell.free ? (
              <>
                <span className="font-display text-xl text-primary leading-none">★</span>
                <span className="text-[7px] font-black uppercase text-center">
                  {THEMES[room.theme].premium ? "VIP" : "FREE"}
                </span>
              </>
            ) : (
              <>
                <span className="text-[9px] font-bold uppercase leading-tight">{cell.event}</span>
                {cell.marked && (
                  <div className="absolute inset-0 bg-primary/90 flex items-center justify-center animate-stamp">
                    <span className="font-display text-primary-foreground text-xl -rotate-12">
                      FEITO
                    </span>
                  </div>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {/* Swap card button for subscribers */}
      {isSubscriber && !finished && (
        <div className="mb-4">
          <button
            onClick={swapCard}
            disabled={swapsCount >= 3 || swapping}
            className="w-full bg-accent text-accent-foreground font-display px-4 py-2 uppercase tracking-widest text-xs hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {swapping
              ? "Trocando..."
              : swapsCount >= 3
                ? "Limite de trocas atingido"
                : `Trocar cartela (${3 - swapsCount} restantes)`}
          </button>
        </div>
      )}

      <p className="font-mono text-[10px] text-muted-foreground uppercase mb-2">
        Tema: {THEMES[room.theme].label}
      </p>

      {/* Final ranking */}
      {finished && (
        <div className="bg-card border border-primary p-4 mb-6">
          <h3 className="font-display text-2xl uppercase text-primary mb-3">Ranking Final</h3>
          <div className="space-y-2">
            {participants.map((p, i) => (
              <div
                key={p.id}
                className="flex justify-between items-center border-b border-border pb-2"
              >
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl text-primary w-6">{i + 1}º</span>
                  <div>
                    <p className="text-sm font-bold">{p.display_name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {p.marks_count} eventos · {p.bingos} bingos
                    </p>
                  </div>
                </div>
                <span className="font-display text-lg">{p.score} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Creator end button */}
      {isCreator && !finished && (
        <button
          onClick={endGame}
          className="w-full bg-destructive text-destructive-foreground font-display px-6 py-3 uppercase tracking-widest text-sm mb-6 hover:cursor-pointer"
        >
          Encerrar bingo
        </button>
      )}

      <Link
        to="/"
        className="block text-center font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
      >
        ← Voltar ao início
      </Link>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 50 });
  const colors = ["bg-primary", "bg-accent", "bg-orange-500", "bg-red-500", "bg-blue-500"];
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((_, i) => (
        <div
          key={i}
          className={`absolute size-2 ${colors[i % colors.length]} animate-confetti`}
          style={{
            left: `${Math.random() * 100}%`,
            top: "-10px",
            animationDelay: `${Math.random() * 1.5}s`,
            animationDuration: `${2 + Math.random() * 1.5}s`,
          }}
        />
      ))}
    </div>
  );
}
