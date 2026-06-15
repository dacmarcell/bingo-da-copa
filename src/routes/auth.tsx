import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar - Bingo da Copa" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin"|"signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Você já pode jogar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("Erro ao entrar com Google"); return; }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 max-w-md mx-auto flex flex-col">
      <Link to="/" className="font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground mb-8 mt-2">← voltar</Link>
      <div className="flex-1 flex flex-col justify-center">
        <div className="size-12 bg-accent rounded-sm flex items-center justify-center font-display text-2xl text-accent-foreground mb-6">B</div>
        <h1 className="font-display text-4xl uppercase tracking-tight leading-none mb-2">
          {mode === "signin" ? "Entrar" : "Criar conta"}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">Marque eventos, faça bingo, vença o churrasco.</p>

        <button
          onClick={handleGoogle}
          className="w-full bg-foreground text-background font-display px-6 py-3 uppercase tracking-widest text-sm mb-3 hover:opacity-90"
        >
          Continuar com Google
        </button>

        <div className="flex items-center gap-2 my-4">
          <div className="flex-1 h-px bg-border" />
          <span className="font-mono text-[10px] text-muted-foreground uppercase">ou e-mail</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text" required value={name} onChange={e => setName(e.target.value)}
              placeholder="Como te chamam"
              className="w-full bg-input border border-border px-3 py-3 text-sm font-bold placeholder:font-normal placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          )}
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email@exemplo.com" autoComplete="email"
            className="w-full bg-input border border-border px-3 py-3 text-sm font-bold placeholder:font-normal placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <input
            type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="senha (mín 6 caracteres)" autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="w-full bg-input border border-border px-3 py-3 text-sm font-bold placeholder:font-normal placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <button
            type="submit" disabled={loading}
            className="w-full bg-primary text-primary-foreground font-display px-6 py-3 uppercase tracking-widest text-sm disabled:opacity-50"
          >
            {loading ? "..." : mode === "signin" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 text-center font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Não tem conta? Criar agora →" : "Já tem conta? Entrar →"}
        </button>
      </div>
    </div>
  );
}
