import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getSession, setSession, type Session } from "./api";
import { clearLocalData } from "./db";

interface AuthCtx {
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSess] = useState<Session | null>(getSession);

  const signIn = useCallback((s: Session) => { setSession(s); setSess(s); }, []);
  const signOut = useCallback(async () => {
    await api.logout().catch(() => {}); // si no hay red, igualmente cerramos localmente
    setSession(null);
    await clearLocalData();
    setSess(null);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => { setSession(null); void clearLocalData(); setSess(null); };
    window.addEventListener("coperoco:unauthorized", onUnauthorized);
    return () => window.removeEventListener("coperoco:unauthorized", onUnauthorized);
  }, []);

  return <Ctx.Provider value={{ session, signIn, signOut }}>{children}</Ctx.Provider>;
}
