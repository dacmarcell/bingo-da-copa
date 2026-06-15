import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  displayName: string | null;
  isAdmin: boolean;
};

const Ctx = createContext<AuthCtx>({
  session: null, user: null, loading: true, displayName: null, isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const u = session?.user;
    if (!u) { setDisplayName(null); setIsAdmin(false); return; }
    (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", u.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.id),
      ]);
      setDisplayName(p?.display_name ?? u.email?.split("@")[0] ?? "Torcedor");
      setIsAdmin((r ?? []).some((x: { role: string }) => x.role === "admin"));
    })();
  }, [session]);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, displayName, isAdmin }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
