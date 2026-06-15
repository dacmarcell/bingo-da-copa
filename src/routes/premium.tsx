import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/premium")({
  head: () => ({ meta: [{ title: "Premium - Bingo da Copa" }] }),
  component: PremiumPage,
});

function PremiumPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function activate() {
    if (!user) { navigate({ to: "/auth" }); return; }
    // Stub PIX flow - in real life we'd generate a PIX charge and confirm via webhook.
    const expiresAt = new Date(); expiresAt.setMonth(expiresAt.getMonth() + 1);
    const { error } = await supabase.from("subscriptions").upsert({
      user_id: user.id, active: true, expires_at: expiresAt.toISOString(),
    }, { onConflict: "user_id" });
    if (error) { toast.error("Erro ao ativar"); return; }
    toast.success("Premium ativado! Aproveite os temas exclusivos.");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 max-w-md mx-auto pb-24">
      <Header subtitle="Premium" />
      <div className="bg-linear-to-br from-orange-500 to-red-600 p-6 mb-6">
        <h1 className="font-display text-4xl uppercase italic tracking-tighter text-white leading-none">PREMIUM<br/>PASS</h1>
        <p className="text-xs font-bold text-white/90 mt-3">Só R$ 4,90 / mês</p>
      </div>

      <h2 className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest mb-3">O que vem incluso</h2>
      <ul className="space-y-2 mb-8">
        {["Sem anúncios", "Temas exclusivos (Churrasco, Família)", "Cartelas ilimitadas", "Até 3 trocas grátis por jogo"].map(b => (
          <li key={b} className="flex items-center gap-3 bg-card border border-border p-3">
            <span className="text-primary font-display">✓</span>
            <span className="text-sm font-bold">{b}</span>
          </li>
        ))}
      </ul>

      <h2 className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest mb-3">Pagamento via PIX</h2>
      <div className="bg-card border border-border p-4 mb-4">
        <p className="text-xs text-muted-foreground mb-3">
          Após confirmar o pagamento via PIX, sua assinatura é ativada automaticamente por 30 dias.
        </p>
        <button
          onClick={activate}
          className="w-full bg-primary text-primary-foreground font-display px-6 py-3 uppercase tracking-widest text-sm"
        >
          Ativar Premium - R$ 4,90
        </button>
      </div>

      <Link to="/" className="block text-center font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground mt-4">
        ← Voltar
      </Link>
    </div>
  );
}
