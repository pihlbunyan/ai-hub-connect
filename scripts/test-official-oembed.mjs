/**
 * Smoke-test oEmbed validation for one official status URL.
 * Usage: node scripts/test-official-oembed.mjs
 */
const url = "https://x.com/OpenAI/status/2056823271774101907";
const oembedUrl = `https://publish.twitter.com/oembed?${new URLSearchParams({
  url,
  omit_script: "true",
  dnt: "true",
})}`;

const res = await fetch(oembedUrl);
const data = await res.json();
const dateMatch = data.html?.match(/>([A-Za-z]{3} \d{1,2}, \d{4})<\/a>/i);

console.log("status", res.status);
console.log("author", data.author_name, data.author_url);
console.log("canonical", data.url);
console.log("posted", dateMatch?.[1] ?? "missing");
