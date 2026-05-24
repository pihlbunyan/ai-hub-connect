/**
 * Quick smoke test: node scripts/test-google-news-rss.mjs
 */
import {
  buildGoogleNewsRssSearchUrl,
  fetchGoogleNewsRSS,
} from "../src/lib/googleNewsRss.server.ts";

const query = "OpenAI AI";
console.log("URL:", buildGoogleNewsRssSearchUrl(query));
const items = await fetchGoogleNewsRSS(query, 3);
console.log("Items:", items.length);
for (const item of items) {
  console.log("-", item.title);
  console.log("  ", item.source, "|", item.published_at);
  console.log("  ", item.url.slice(0, 80) + (item.url.length > 80 ? "…" : ""));
}
