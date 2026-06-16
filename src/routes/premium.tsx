import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";

type PixTransaction = {
  transaction_id: string;
  amount: number;
  qrCode: string | null;
  expirationDate: string | null;
  status: string;
};

export const Route = createFileRoute("/premium")({
  head: () => ({ meta: [{ title: "Premium - Bingo da Copa" }] }),
  component: PremiumPage,
});

function PremiumPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [transaction, setTransaction] = useState<PixTransaction | null>(null);
  const [polling, setPolling] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  async function createPixCharge() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create_pix_charge", {
        body: JSON.stringify({ amount: 4.9, description: "Assinatura Premium" }),
      });

      if (error) {
        throw new Error(error.message);
      }

      const payload = data as PixTransaction;
      setTransaction(payload);
      setPolling(true);
      toast.success("Cobrança Pix criada. Escaneie o QR Code para pagar.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar cobrança Pix");
    } finally {
      setLoading(false);
    }
  }

  async function refreshTransaction() {
    if (!transaction) return;

    try {
      const { data, error } = await supabase.functions.invoke("get_transaction_status", {
        body: JSON.stringify({ transaction_id: transaction.transaction_id }),
      });

      if (error) {
        console.error("Failed to refresh transaction", error);
        return;
      }

      const payload = data as PixTransaction;
      setTransaction(payload);
      if (payload.status === "PAID") {
        setPolling(false);
        toast.success("Pagamento confirmado! A assinatura será ativada pelo webhook.");
      }
    } catch (err) {
      console.error("Status refresh error", err);
    }
  }

  useEffect(() => {
    if (!polling || !transaction) return;
    const interval = setInterval(refreshTransaction, 5000);
    return () => clearInterval(interval);
  }, [polling, transaction]);

  const formatTransactionStatus = (status: string) => {
    switch (status) {
      case "PENDING":
        return "Pendente";
      case "PAID":
        return "Pago";
      case "FAILED":
        return "Falhou";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 max-w-md mx-auto pb-24">
      <Header subtitle="Premium" />
      <div className="bg-linear-to-br from-orange-500 to-red-600 p-6 mb-6">
        <h1 className="font-display text-4xl uppercase italic tracking-tighter text-white leading-none">
          PREMIUM
          <br />
          PASS
        </h1>
        <p className="text-xs font-bold text-white/90 mt-3">Só R$ 4,90 / mês</p>
      </div>

      <h2 className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest mb-3">
        O que vem incluso
      </h2>
      <ul className="space-y-2 mb-8">
        {[
          "Sem anúncios",
          "Temas exclusivos (Churrasco, Família)",
          "Cartelas ilimitadas",
          "Até 3 trocas grátis por jogo",
        ].map((b) => (
          <li key={b} className="flex items-center gap-3 bg-card border border-border p-3">
            <span className="text-primary font-display">✓</span>
            <span className="text-sm font-bold">{b}</span>
          </li>
        ))}
      </ul>

      <h2 className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest mb-3">
        Pagamento via PIX
      </h2>
      <div className="bg-card border border-border p-4 mb-4">
        <p className="text-xs text-muted-foreground mb-3">
          A assinatura só será ativada após confirmação oficial da Pixup pelo webhook. Enquanto
          isso, o acesso premium permanece bloqueado.
        </p>
        <button
          onClick={createPixCharge}
          disabled={loading || !!transaction}
          className="w-full bg-primary text-primary-foreground font-display px-6 py-3 uppercase tracking-widest text-sm hover:cursor-pointer disabled:opacity-50"
        >
          {transaction
            ? "Pagamento pendente"
            : loading
              ? "Aguardando..."
              : "Pagar com Pix - R$ 4,90"}
        </button>
      </div>

      {transaction && (
        <div className="bg-card border border-border p-4 mb-4">
          <h3 className="font-display text-lg uppercase tracking-tight mb-3">Pagamento Pix</h3>
          <div className="space-y-4">
            {transaction?.qrCode ? (
              <>
                <div className="flex justify-center">
                  <QRCode value={transaction.qrCode} size={256} />
                </div>

                <div className="bg-background border border-border p-3 rounded-md">
                  <p className="text-[10px] uppercase text-muted-foreground mb-2">Copiar e colar</p>

                  <textarea
                    readOnly
                    value={transaction.qrCode}
                    rows={4}
                    className="w-full resize-none rounded-md border border-border p-2 text-xs"
                  />
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(transaction.qrCode!);
                    setHasCopied(true);
                  }}
                  className={`text-primary-foreground font-display w-full border border-border p-2 text-sm hover:cursor-pointer ${hasCopied ? "bg-primary text-black" : "hover:bg-muted text-white"}`}
                >
                  {hasCopied ? "Código PIX copiado!" : "Copiar código PIX"}
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">QR Code indisponível.</p>
            )}

            <p className="text-xs text-muted-foreground">
              Status:{" "}
              <span className="font-bold uppercase">
                {formatTransactionStatus(transaction.status)}
              </span>
            </p>
            {transaction.expirationDate ? (
              <p className="text-xs text-muted-foreground">
                Expira em: {new Date(transaction.expirationDate).toLocaleString("pt-BR")}
              </p>
            ) : null}
          </div>
        </div>
      )}

      <Link
        to="/"
        className="block text-center font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground mt-4"
      >
        ← Voltar
      </Link>
    </div>
  );
}
