import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { copy, type Copy } from "@/lib/copy";
import { proEnabledFromProfile, profileDbModeFromPro } from "@/lib/depth";

type Theme = "light" | "dark";

type AppContextValue = {
  /**
   * proEnabled is the SINGLE source of truth for depth level.
   * When true → unlocks richer tool details, advanced filters, chat metrics, safety scores, etc.
   * Default = false (friendly, accessible experience for all users).
   * All components should read from proEnabled instead of any legacy "mode".
   */
  proEnabled: boolean;
  setProEnabled: (enabled: boolean) => void;
  togglePro: () => void;
  t: Copy;
  theme: Theme;
  toggleTheme: () => void;
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AppContext = React.createContext<AppContextValue | null>(null);

const PRO_KEY = "pihlai.pro";
const THEME_KEY = "pihlai.theme";
/** Removed after one-time migration into PRO_KEY. */
const LEGACY_PRO_KEY = "pihlai.mode";

function readStoredProEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const stored = localStorage.getItem(PRO_KEY);
  if (stored === "1" || stored === "true") return true;
  if (stored === "0" || stored === "false") return false;

  if (localStorage.getItem(LEGACY_PRO_KEY) === "pro") {
    localStorage.setItem(PRO_KEY, "1");
    localStorage.removeItem(LEGACY_PRO_KEY);
    return true;
  }

  return false;
}

function writeStoredProEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PRO_KEY, enabled ? "1" : "0");
  localStorage.removeItem(LEGACY_PRO_KEY);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [proEnabled, setProEnabledState] = React.useState(false);
  const [theme, setTheme] = React.useState<Theme>("light");
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setProEnabledState(readStoredProEnabled());

    const th = localStorage.getItem(THEME_KEY) as Theme | null;
    if (th === "dark" || th === "light") setTheme(th);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (typeof window !== "undefined") localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

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

  React.useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("mode")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.mode != null) {
          setProEnabledState(proEnabledFromProfile(data.mode));
          writeStoredProEnabled(proEnabledFromProfile(data.mode));
        }
      });
  }, [user]);

  const setProEnabled = React.useCallback(
    (enabled: boolean) => {
      setProEnabledState(enabled);
      writeStoredProEnabled(enabled);
      if (user) {
        void supabase
          .from("profiles")
          .update({ mode: profileDbModeFromPro(enabled) })
          .eq("id", user.id);
      }
    },
    [user],
  );

  const value = React.useMemo<AppContextValue>(
    () => ({
      proEnabled,
      setProEnabled,
      togglePro: () => setProEnabled(!proEnabled),
      t: copy,
      theme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
      user,
      session,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [proEnabled, setProEnabled, theme, user, session, loading],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
