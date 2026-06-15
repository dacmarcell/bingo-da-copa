import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function Header({ subtitle }: { subtitle?: string }) {
  const { user, displayName, isAdmin } = useAuth();
  return (
    <nav className="flex items-center justify-between mb-6 sticky top-0 bg-background/80 backdrop-blur-md py-3 z-20 -mx-4 px-4 border-b border-border">
      <Link to="/" className="flex items-center gap-3">
        <div className="size-10 bg-accent rounded-sm flex items-center justify-center font-display text-xl text-accent-foreground">B</div>
        <div className="leading-none">
          <h1 className="font-display text-lg tracking-wide uppercase">Bingo da Copa</h1>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter">
            {subtitle ?? "Marque os eventos. Faça bingo."}
          </p>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        {isAdmin && (
          <Link to="/admin" className="font-mono text-[10px] uppercase text-primary hover:underline">Admin</Link>
        )}
        {user ? (
          <>
            <span className="hidden sm:inline text-xs font-bold uppercase tracking-tight">{displayName}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
            >
              Sair
            </button>
          </>
        ) : (
          <Link to="/auth" className="bg-primary text-primary-foreground font-display text-xs uppercase tracking-widest px-3 py-1.5">
            Entrar
          </Link>
        )}
      </div>
    </nav>
  );
}
