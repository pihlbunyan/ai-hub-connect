import type { Database } from "@/integrations/supabase/types";

export type NewsPost = Database["public"]["Tables"]["news_posts"]["Row"];

/** Columns used by news lists and detail views. */
export const NEWS_POST_SELECT =
  "id,title,summary,content,source,url,published_at,image_url,related_tool_slug,created_at,updated_at" as const;

function buildNewsSearchCorpus(post: NewsPost): string {
  return [post.title, post.summary, post.content, post.source].join(" ").toLowerCase();
}

/** Case-insensitive filter; every whitespace-separated term must appear somewhere in the corpus. */
export function filterNewsPosts(posts: NewsPost[], query: string): NewsPost[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return posts;

  return posts.filter((post) => {
    const corpus = buildNewsSearchCorpus(post);
    return terms.every((term) => corpus.includes(term));
  });
}
