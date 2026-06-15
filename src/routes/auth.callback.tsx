import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Callback de autenticação" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!mounted) return;

        if (data.session) {
          navigate({ to: "/" });
        } else {
          toast.error("Sessão não encontrada. Faça login novamente.");
          navigate({ to: "/auth" });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao obter sessão");
        navigate({ to: "/auth" });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 max-w-md mx-auto flex items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-semibold">Autenticando...</p>
        <p className="text-sm text-muted-foreground mt-2">
          Aguarde enquanto verificamos sua sessão e redirecionamos.
        </p>
        {loading && (
          <div className="mt-4 animate-pulse text-xs text-muted-foreground">
            Carregando sessão...
          </div>
        )}
      </div>
    </div>
  );
}
