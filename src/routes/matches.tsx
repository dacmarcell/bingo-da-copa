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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    supabase
      .from("matches")
      .select("*", { count: "exact" })
      .gte("starts_at", todayStart.toISOString())
      .neq("status", "finished")
      .order("starts_at", { ascending: true })
      .range(from, to)
      .then(({ data, count }) => {
        setMatches((data ?? []) as Match[]);
        setTotalPages(count ? Math.ceil(count / pageSize) : 0);
      });
  }, [page]);

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 max-w-md mx-auto pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight mb-2">Partidas</h1>
          <p className="text-sm text-muted-foreground">Somente partidas de hoje em diante.</p>
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
                  timeZone: "UTC",
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

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={!hasPrevious}
            className="flex-1 bg-card border border-border px-4 py-3 text-sm uppercase tracking-widest disabled:opacity-50 hover:cursor-pointer"
          >
            Anterior
          </button>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            Página {page} de {totalPages || 1}
          </span>
          <button
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={!hasNext}
            className="flex-1 bg-card border border-border px-4 py-3 text-sm uppercase tracking-widest disabled:opacity-50 hover:cursor-pointer"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
