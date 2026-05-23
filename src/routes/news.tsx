import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw } from "lucide-react";
import { emitContentRefresh } from "@/lib/contentRefresh";
import { NewsLatestTab } from "@/components/NewsLatestTab";
import { OfficialUpdatesTab } from "@/components/OfficialUpdatesTab";

export const Route = createFileRoute("/news")({ component: NewsPage });

type NewsTab = "latest" | "official";

function NewsPage() {
  const { mode } = useApp();
  const [activeTab, setActiveTab] = useState<NewsTab>("latest");
  const [refreshing, setRefreshing] = useState(false);

  function onRefresh() {
    emitContentRefresh(activeTab === "latest" ? "news" : "official-updates");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">AI News Feed</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            {mode === "pro"
              ? "Curated stories and verified announcements from leading AI companies."
              : "Stay current with AI news and official updates from the teams building the tools."}
          </p>
        </div>
        <Button
          onClick={onRefresh}
          disabled={refreshing}
          variant="outline"
          className="shrink-0 gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NewsTab)} className="w-full">
        <TabsList className="mb-6 grid h-11 w-full max-w-md grid-cols-2 gap-1 bg-muted/60 p-1 sm:max-w-lg">
          <TabsTrigger value="latest" className="h-9 text-sm font-medium sm:text-[0.9375rem]">
            Latest News
          </TabsTrigger>
          <TabsTrigger value="official" className="h-9 text-sm font-medium sm:text-[0.9375rem]">
            Official Updates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="latest" className="mt-0 focus-visible:outline-none">
          <NewsLatestTab onRefreshingChange={setRefreshing} />
        </TabsContent>

        <TabsContent value="official" className="mt-0 focus-visible:outline-none">
          <OfficialUpdatesTab onRefreshingChange={setRefreshing} />
        </TabsContent>
      </Tabs>

      <div className="mt-10 border-t pt-6">
        <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
