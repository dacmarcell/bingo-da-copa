import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export const Route = createFileRoute("/matches")({
  head: () => ({ meta: [{ title: "Todas as partidas - Bingo da Copa" }] }),
  component: MatchesPage,
});

function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    supabase
      .from("matches")
      .select("*")
      .gte("starts_at", todayStart.toISOString())
      .neq("status", "finished")
      .order("starts_at", { ascending: true })
      .then(({ data }) => setMatches((data ?? []) as Match[]));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 max-w-md mx-auto pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight mb-2">Partidas</h1>
          <p className="text-sm text-muted-foreground">
            Somente partidas de hoje em diante e sem jogos finalizados.
          </p>
        </div>
        <Link to="/" className="font-mono text-[10px] uppercase text-primary hover:underline">
          Voltar
        </Link>
      </div>

      <div className="space-y-2">
        {matches.map((m) => (
          <div key={m.id} className="bg-card border border-border p-4 rounded-md">
            <p className="font-mono text-[10px] text-muted-foreground uppercase mb-2">
              {m.competition}
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-base tracking-tight">
                  {m.team_a_code} × {m.team_b_code}
                </p>
                <p className="text-sm text-muted-foreground">
                  {m.team_a} vs {m.team_b}
                </p>
              </div>
              <p className="font-mono text-xs text-muted-foreground text-right">
                {new Date(m.starts_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                <br />
                <span className="uppercase">{m.status === "live" ? "AO VIVO" : "AGENDADO"}</span>
              </p>
            </div>
          </div>
        ))}

        {!matches.length && (
          <p className="text-xs text-muted-foreground italic">
            Nenhuma partida cadastrada para hoje ou depois.
          </p>
        )}
      </div>
    </div>
  );
}
