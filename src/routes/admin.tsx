import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin - Bingo da Copa" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<Array<{ id: string; team_a: string; team_b: string; team_a_code: string; team_b_code: string; starts_at: string; status: string }>>([]);
  const [stats, setStats] = useState({ users: 0, rooms: 0, subs: 0 });
  const [form, setForm] = useState({ team_a: "", team_b: "", team_a_code: "", team_b_code: "", competition: "Copa do Mundo", starts_at: "" });

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (!isAdmin) { toast.error("Acesso restrito"); navigate({ to: "/" }); }
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [{ data: m }, { count: rc }, { count: sc }, { count: uc }] = await Promise.all([
        supabase.from("matches").select("*").order("starts_at"),
        supabase.from("rooms").select("*", { count: "exact", head: true }),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
      ]);
      setMatches((m ?? []) as typeof matches);
      setStats({ rooms: rc ?? 0, subs: sc ?? 0, users: uc ?? 0 });
    })();
  }, [isAdmin]);

  async function createMatch(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("matches").insert({
      ...form, starts_at: new Date(form.starts_at).toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Partida criada");
    setForm({ team_a: "", team_b: "", team_a_code: "", team_b_code: "", competition: "Copa do Mundo", starts_at: "" });
    const { data } = await supabase.from("matches").select("*").order("starts_at");
    setMatches((data ?? []) as typeof matches);
  }

  async function deleteMatch(id: string) {
    await supabase.from("matches").delete().eq("id", id);
    setMatches(m => m.filter(x => x.id !== id));
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 max-w-md mx-auto pb-24">
      <Header subtitle="Painel admin" />

      <div className="grid grid-cols-3 gap-2 mb-8">
        {[
          { label: "Usuários", v: stats.users },
          { label: "Salas", v: stats.rooms },
          { label: "Premium", v: stats.subs },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border p-3">
            <p className="font-mono text-[10px] text-muted-foreground uppercase">{s.label}</p>
            <p className="font-display text-2xl">{s.v}</p>
          </div>
        ))}
      </div>

      <h2 className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest mb-3">Nova partida</h2>
      <form onSubmit={createMatch} className="space-y-2 mb-8">
        <div className="grid grid-cols-2 gap-2">
          <input required placeholder="Time A" value={form.team_a} onChange={e => setForm({...form, team_a: e.target.value})} className="bg-input border border-border px-3 py-2 text-sm" />
          <input required placeholder="Time B" value={form.team_b} onChange={e => setForm({...form, team_b: e.target.value})} className="bg-input border border-border px-3 py-2 text-sm" />
          <input required maxLength={4} placeholder="Sigla A" value={form.team_a_code} onChange={e => setForm({...form, team_a_code: e.target.value.toUpperCase()})} className="bg-input border border-border px-3 py-2 text-sm font-mono uppercase" />
          <input required maxLength={4} placeholder="Sigla B" value={form.team_b_code} onChange={e => setForm({...form, team_b_code: e.target.value.toUpperCase()})} className="bg-input border border-border px-3 py-2 text-sm font-mono uppercase" />
        </div>
        <input required placeholder="Competição" value={form.competition} onChange={e => setForm({...form, competition: e.target.value})} className="w-full bg-input border border-border px-3 py-2 text-sm" />
        <input required type="datetime-local" value={form.starts_at} onChange={e => setForm({...form, starts_at: e.target.value})} className="w-full bg-input border border-border px-3 py-2 text-sm" />
        <button type="submit" className="w-full bg-primary text-primary-foreground font-display px-6 py-3 uppercase tracking-widest text-sm">
          Criar partida
        </button>
      </form>

      <h2 className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest mb-3">Partidas</h2>
      <div className="space-y-2 mb-8">
        {matches.map(m => (
          <div key={m.id} className="bg-card border border-border p-3 flex justify-between items-center">
            <div>
              <p className="font-bold text-sm">{m.team_a_code} × {m.team_b_code}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{new Date(m.starts_at).toLocaleString("pt-BR")} · {m.status}</p>
            </div>
            <button onClick={() => deleteMatch(m.id)} className="font-mono text-[10px] uppercase text-destructive">Excluir</button>
          </div>
        ))}
      </div>

      <Link to="/" className="block text-center font-mono text-[10px] uppercase text-muted-foreground">← voltar</Link>
    </div>
  );
}
