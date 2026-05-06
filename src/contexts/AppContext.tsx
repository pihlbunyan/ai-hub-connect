import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { copy, type Mode } from "@/lib/copy";

type Theme = "light" | "dark";

type AppContextValue = {
  mode: Mode;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  t: (typeof copy)[Mode];
  theme: Theme;
  toggleTheme: () => void;
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AppContext = React.createContext<AppContextValue | null>(null);

const MODE_KEY = "pihlai.mode";
const THEME_KEY = "pihlai.theme";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<Mode>("lay");
  const [theme, setTheme] = React.useState<Theme>("light");
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  // hydrate from storage
  React.useEffect(() => {
    const m = (typeof window !== "undefined" && localStorage.getItem(MODE_KEY)) as Mode | null;
    const th = (typeof window !== "undefined" && localStorage.getItem(THEME_KEY)) as Theme | null;
    if (m === "pro" || m === "lay") setModeState(m);
    if (th === "dark" || th === "light") setTheme(th);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (typeof window !== "undefined") localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // auth bootstrap
  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // load profile mode when user logs in
  React.useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("mode").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.mode === "pro" || data?.mode === "lay") setModeState(data.mode);
    });
  }, [user]);

  const setMode = React.useCallback(
    (m: Mode) => {
      setModeState(m);
      if (typeof window !== "undefined") localStorage.setItem(MODE_KEY, m);
      if (user) void supabase.from("profiles").update({ mode: m }).eq("id", user.id);
    },
    [user],
  );

  const value = React.useMemo<AppContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode: () => setMode(mode === "pro" ? "lay" : "pro"),
      t: copy[mode],
      theme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
      user,
      session,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [mode, setMode, theme, user, session, loading],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
