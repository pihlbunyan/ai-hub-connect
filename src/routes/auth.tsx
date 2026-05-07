import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const { t, user } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const redirectTo =
    typeof window !== "undefined"
      ? decodeURIComponent(new URLSearchParams(window.location.search).get("redirect") || "/dashboard")
      : "/dashboard";

  useEffect(() => {
    if (user) nav({ to: redirectTo as "/dashboard" });
  }, [user, nav, redirectTo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setBusy(true);
    try {
      if (tab === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created. You are now signed in.");
          nav({ to: redirectTo as "/dashboard" });
        } else {
          toast.success("Account created. Check your email to confirm before signing in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        nav({ to: redirectTo as "/dashboard" });
      }
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err);
      setAuthError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/dashboard` });
    if (r.error) toast.error("Google sign-in failed");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md items-center px-6 py-12">
      <div className="w-full rounded-2xl border bg-card p-8 shadow-card">
        <h1 className="font-display text-2xl font-bold">{t.authTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.authSubtitle}</p>

        <div className="mt-6 inline-flex rounded-md border p-0.5 text-sm">
          <button
            onClick={() => {
              setTab("signin");
              setAuthError(null);
            }}
            className={`rounded px-3 py-1 ${tab === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Sign in
          </button>
          <button
            onClick={() => {
              setTab("signup");
              setAuthError(null);
            }}
            className={`rounded px-3 py-1 ${tab === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {tab === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (authError) setAuthError(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (authError) setAuthError(null);
              }}
            />
          </div>
          {authError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {authError}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : tab === "signin" ? "Sign in" : "Create account"}
          </Button>
          {tab === "signin" && (
            <p className="text-center text-sm text-muted-foreground">
              New to Pihlai?{" "}
              <button
                type="button"
                onClick={() => {
                  setTab("signup");
                  setAuthError(null);
                }}
                className="font-medium text-primary hover:underline"
              >
                Sign up
              </button>
            </p>
          )}
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          OR
          <div className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" onClick={google}>
          Continue with Google
        </Button>
      </div>
    </div>
  );
}

function getAuthErrorMessage(err: unknown) {
  if (!(err instanceof Error)) return "Authentication failed";
  const msg = err.message.toLowerCase();
  if (msg.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
    return "Your email is not confirmed yet. Confirm it from your inbox, or disable email confirmation in Supabase Auth settings for dev.";
  }
  if (msg.includes("user already registered")) {
    return "This email is already registered. Try signing in instead.";
  }
  return err.message;
}
