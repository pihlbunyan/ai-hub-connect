import { Link } from "@tanstack/react-router";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Sparkles, Moon, Sun, LogOut } from "lucide-react";
import { ModeToggle } from "./ModeToggle";

export function NavBar() {
  const { t, theme, toggleTheme, user, signOut } = useApp();
  const username =
    (user?.user_metadata?.display_name as string | undefined)?.trim() ||
    user?.email?.split("@")[0] ||
    "Account";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <span>Pihlai</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">{t.tagline}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/tools">{t.navDirectory}</NavLink>
          <NavLink to="/topics">{t.navTopics}</NavLink>
          <NavLink to="/chat">{t.navChat}</NavLink>
          <NavLink to="/news">{t.navNews}</NavLink>
          <NavLink to="/dashboard">{t.navDashboard}</NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {user ? (
            <>
              <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground sm:inline">
                Logged in as {username}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out" className="gap-1.5">
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      activeProps={{ className: "bg-muted text-foreground" }}
    >
      {children}
    </Link>
  );
}
