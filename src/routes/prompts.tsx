import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useApp } from "@/contexts/AppContext";
import { PROMPT_CATEGORIES, PROMPTS, getPromptForMode, getPromptSupportText } from "@/lib/promptRepo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Copy, MessageSquare, Sparkles, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ContentFreshnessBadge } from "@/components/ContentFreshnessBadge";
import { subscribeContentRefresh } from "@/lib/contentRefresh";

export const Route = createFileRoute("/prompts")({ component: PromptsPage });

function PromptsPage() {
  const { mode, user } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [savedPromptIds, setSavedPromptIds] = useState<Set<string>>(new Set());
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
  const [saveFeatureAvailable, setSaveFeatureAvailable] = useState(true);
  const [saveFeatureMessage, setSaveFeatureMessage] = useState<string | null>(null);
  const [promptTimestamps, setPromptTimestamps] = useState<
    Map<string, { created_at: string; updated_at: string }>
  >(new Map());

  const loadPromptTimestamps = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_prompt_catalog_timestamps");
    if (error) return;
    setPromptTimestamps(
      new Map((data ?? []).map((row) => [row.prompt_id, { created_at: row.created_at, updated_at: row.updated_at }])),
    );
  }, []);

  useEffect(() => {
    void loadPromptTimestamps();
  }, [loadPromptTimestamps]);

  useEffect(() => subscribeContentRefresh("prompts", () => void loadPromptTimestamps()), [loadPromptTimestamps]);

  useEffect(() => {
    if (!user) {
      setSavedPromptIds(new Set());
      setSavedOnly(false);
      return;
    }
    supabase
      .from("prompt_saves")
      .select("prompt_id")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (error) {
          if (error.code === "42P01") {
            setSaveFeatureAvailable(false);
            setSaveFeatureMessage("Saved prompts are temporarily unavailable until the latest database migration is applied.");
            return;
          }
          setSaveFeatureAvailable(false);
          setSaveFeatureMessage("Unable to load saved prompts right now.");
          return;
        }
        setSaveFeatureAvailable(true);
        setSaveFeatureMessage(null);
        setSavedPromptIds(new Set((data ?? []).map((row) => row.prompt_id)));
      });
  }, [user]);

  const filtered = useMemo(() => {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    return PROMPTS.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (savedOnly && !savedPromptIds.has(item.id)) return false;
      if (terms.length === 0) return true;

      const corpus = [
        item.title,
        item.description,
        item.category,
        getPromptForMode(item, mode),
        getPromptSupportText(item, mode),
      ]
        .join(" ")
        .toLowerCase();

      return terms.every((term) => corpus.includes(term));
    });
  }, [category, mode, query, savedOnly, savedPromptIds]);

  async function copyPrompt(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt copied");
    } catch {
      toast.error("Could not copy prompt");
    }
  }

  async function toggleSave(promptId: string) {
    if (!user) {
      toast.error("Sign in to save prompts");
      navigate({
        to: "/auth",
        search: { redirect: `${window.location.pathname}${window.location.search}` } as never,
      });
      return;
    }
    if (!saveFeatureAvailable) {
      toast.error("Saved prompts are unavailable until database migrations are applied.");
      return;
    }

    const item = PROMPTS.find((prompt) => prompt.id === promptId);
    if (!item) return;
    const content = getPromptForMode(item, mode);

    setSavingPromptId(promptId);
    const isSaved = savedPromptIds.has(promptId);
    const next = new Set(savedPromptIds);

    if (isSaved) {
      const { error } = await supabase
        .from("prompt_saves")
        .delete()
        .eq("user_id", user.id)
        .eq("prompt_id", promptId);
      if (error) {
        toast.error(error.message);
        setSavingPromptId(null);
        return;
      }
      next.delete(promptId);
      toast.success("Prompt removed");
    } else {
      const { error } = await supabase.from("prompt_saves").insert({
        user_id: user.id,
        prompt_id: promptId,
        title: item.title,
        content,
        category: item.category,
      });
      if (error) {
        if (error.code === "42P01") {
          setSaveFeatureAvailable(false);
          setSaveFeatureMessage("Saved prompts are temporarily unavailable until the latest database migration is applied.");
        }
        toast.error(error.message);
        setSavingPromptId(null);
        return;
      }
      next.add(promptId);
      toast.success("Prompt saved");
    }

    setSavedPromptIds(next);
    setSavingPromptId(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          {mode === "pro" ? "Prompt Repository" : "Example Prompts"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {mode === "pro"
            ? "Production-ready prompts for Grok workflows. Includes system prompt structure and optimization notes."
            : "Search friendly prompts you can copy instantly or run in chat with one click."}
        </p>
      </header>
      {saveFeatureMessage && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          {saveFeatureMessage}
        </div>
      )}

      <div className="mb-5 rounded-2xl border bg-card p-4 shadow-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "pro" ? "Search prompts, systems, optimization notes..." : "Search prompts by goal or category..."}
            className="pl-9"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={category === "all" ? "default" : "outline"}
            onClick={() => setCategory("all")}
          >
            All
          </Button>
          {PROMPT_CATEGORIES.map((cat) => (
            <Button
              key={cat}
              type="button"
              size="sm"
              variant={category === cat ? "default" : "outline"}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Button>
          ))}
          {user && saveFeatureAvailable && (
            <Button
              type="button"
              size="sm"
              variant={savedOnly ? "default" : "outline"}
              onClick={() => setSavedOnly((prev) => !prev)}
            >
              Saved only
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{filtered.length} prompts{user && saveFeatureAvailable ? ` · ${savedPromptIds.size} saved` : ""}</span>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" />
          Curated prompt library
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const prompt = getPromptForMode(item, mode);
          const support = getPromptSupportText(item, mode);
          return (
            <Card key={item.id} className="flex h-full flex-col rounded-2xl shadow-card">
              <CardHeader className="pb-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.category}</Badge>
                  <ContentFreshnessBadge
                    updatedAt={promptTimestamps.get(item.id)?.updated_at}
                    createdAt={promptTimestamps.get(item.id)?.created_at}
                  />
                </div>
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="rounded-xl border bg-background/60 p-3">
                  <p className="line-clamp-6 whitespace-pre-wrap text-sm text-foreground/90">{prompt}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {support}
                </p>
              </CardContent>
              <CardFooter className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="gap-2" onClick={() => void copyPrompt(prompt)}>
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
                <Button asChild className="gap-2">
                  <Link to="/chat" search={{ prompt: `${prompt}\n\nContext: ${item.title}` } as never}>
                    <MessageSquare className="h-4 w-4" />
                    Try in Chat
                  </Link>
                </Button>
                {user && saveFeatureAvailable && (
                  <Button
                    type="button"
                    variant={savedPromptIds.has(item.id) ? "default" : "outline"}
                    className="col-span-2 gap-2"
                    disabled={savingPromptId === item.id}
                    onClick={() => void toggleSave(item.id)}
                  >
                    <Heart className={cn("h-4 w-4", savedPromptIds.has(item.id) && "fill-current")} />
                    {savedPromptIds.has(item.id) ? "Saved" : "Save Prompt"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          No prompts matched your search. Try a broader keyword or a different category.
        </div>
      )}
    </div>
  );
}
