import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { subscribeContentRefresh } from "@/lib/contentRefresh";
import {
  OFFICIAL_POST_SELECT,
  OFFICIAL_X_ACCOUNTS,
  type OfficialSocialPost,
  formatOfficialHandle,
  officialProfileUrl,
} from "@/lib/officialUpdates";
import { OfficialAvatar } from "@/components/OfficialAvatar";
import { OfficialUpdateRow } from "@/components/OfficialUpdateRow";

export function OfficialUpdatesTab() {
  const [posts, setPosts] = useState<OfficialSocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("official_social_posts")
      .select(OFFICIAL_POST_SELECT)
      .order("posted_at", { ascending: false })
      .limit(40);

    if (fetchError) {
      setError(fetchError.message);
      setPosts([]);
    } else {
      setPosts(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(
    () => subscribeContentRefresh("official-updates", () => void loadPosts(true)),
    [loadPosts],
  );

  const sortedPosts = useMemo(
    () =>
      [...posts].sort(
        (a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
      ),
    [posts],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4 text-sm text-muted-foreground">
        Verified posts from major AI companies, newest first.
      </p>

      <div className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {OFFICIAL_X_ACCOUNTS.map((account) => (
          <a
            key={account.handle}
            href={officialProfileUrl(account.handle)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border/80 bg-muted/30 py-1 pl-1 pr-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            <OfficialAvatar handle={account.handle} name={account.name} size="sm" />
            {formatOfficialHandle(account.handle)}
          </a>
        ))}
      </div>

      {error && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/15 px-6 py-12 text-center">
          <p className="text-lg font-medium">No official updates yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Posts from monitored accounts appear here after{" "}
            <span className="font-medium text-foreground">Generate Official Updates</span> runs in Admin.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5 sm:gap-3" aria-label="Official updates">
          {sortedPosts.map((post) => (
            <li key={post.id}>
              <OfficialUpdateRow post={post} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
