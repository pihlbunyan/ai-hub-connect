/**
 * Curated logo URL candidates for directory tools (slug → ordered URLs, best first).
 * Prefer official PNG/SVG/apple-touch-icon; chain DuckDuckGo → icon.horse → Google as fallbacks.
 * Avoid Wikimedia /thumb/ paths (they often 400).
 */

export const TOOL_DOMAINS: Record<string, string> = {
  claude: "claude.ai",
  "claude-artifacts": "claude.ai",
  chatgpt: "openai.com",
  "dall-e": "openai.com",
  sora: "openai.com",
  "openai-platform": "platform.openai.com",
  xai: "x.ai",
  grok: "x.ai",
  gemini: "gemini.google.com",
  alphafold: "ebi.ac.uk",
  "meta-ai": "meta.ai",
  "nvidia-nim": "nvidia.com",
  mistral: "mistral.ai",
  "hugging-face": "huggingface.co",
  "microsoft-copilot": "copilot.microsoft.com",
  "github-copilot": "github.com",
  "azure-openai": "azure.microsoft.com",
  "amazon-bedrock": "aws.amazon.com",
  cohere: "cohere.com",
  groq: "groq.com",
  "together-ai": "together.ai",
  perplexity: "perplexity.ai",
  "character-ai": "character.ai",
  cursor: "cursor.com",
  midjourney: "midjourney.com",
  kling: "klingai.com",
  runway: "runwayml.com",
  "stable-diffusion": "stability.ai",
  elevenlabs: "elevenlabs.io",
  replicate: "replicate.com",
  "fireworks-ai": "fireworks.ai",
  langchain: "langchain.com",
  zapier: "zapier.com",
  "zapier-agents": "zapier.com",
  lindy: "lindy.ai",
  n8n: "n8n.io",
  openrouter: "openrouter.ai",
  synthesia: "synthesia.io",
  "tesla-ai": "tesla.com",
  "the-rundown-ai": "therundown.ai",
  "tldr-ai": "tldr.tech",
  "mit-tech-review-ai": "technologyreview.com",
};

/** DuckDuckGo favicon — very reliable, good default fallback. */
export function ddgIcon(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

/** icon.horse — high-res favicon proxy, second fallback. */
export function iconHorse(domain: string): string {
  return `https://icon.horse/icon/${domain}`;
}

/** Google favicon service — third fallback. */
export function googleFavicon(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** Standard domain-based fallback chain (always appended last). */
export function domainFallbacks(domain: string): readonly string[] {
  return [ddgIcon(domain), iconHorse(domain), googleFavicon(domain, 128), googleFavicon(domain, 64)];
}

/** URLs that frequently fail in hotlinked img tags — deprioritize or skip. */
export function isLikelyBrokenLogoUrl(url: string): boolean {
  return /\/thumb\//.test(url) || /_next\/image/.test(url) || /wikimedia\.org.*\/thumb\//.test(url);
}

function dedupeUrls(urls: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** Merge primary candidates with domain fallbacks. */
function withDomainFallbacks(domain: string, ...primaries: string[]): readonly string[] {
  return dedupeUrls([...primaries, ...domainFallbacks(domain)]);
}

/** Shared xAI / Grok brand assets (tools slug `xai` + `grok`, Official Updates @xai). */
export const XAI_LOGO_CANDIDATES = [
  "https://x.ai/favicon.ico",
  "https://grok.x.ai/favicon.ico",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/XAI_logo.svg/256px-XAI_logo.svg.png",
] as const;

/**
 * Curated logo candidates per slug; domain fallbacks appended for reliability.
 */
export const KNOWN_TOOL_LOGO_CANDIDATES: Record<string, readonly string[]> = {
  claude: withDomainFallbacks(
    TOOL_DOMAINS.claude,
    "https://claude.ai/images/claude_app_icon.png",
    "https://claude.ai/apple-touch-icon.png",
    "https://www.anthropic.com/favicon.ico",
  ),
  "claude-artifacts": withDomainFallbacks(
    TOOL_DOMAINS["claude-artifacts"],
    "https://claude.ai/images/claude_app_icon.png",
    "https://claude.ai/apple-touch-icon.png",
    "https://www.anthropic.com/favicon.ico",
  ),
  chatgpt: withDomainFallbacks(
    TOOL_DOMAINS.chatgpt,
    "https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg",
    "https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg",
    "https://chatgpt.com/favicon.ico",
  ),
  xai: withDomainFallbacks(TOOL_DOMAINS.xai, ...XAI_LOGO_CANDIDATES),
  grok: withDomainFallbacks(TOOL_DOMAINS.grok, ...XAI_LOGO_CANDIDATES),
  "dall-e": withDomainFallbacks(
    TOOL_DOMAINS["dall-e"],
    "https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg",
    "https://openai.com/favicon.ico",
  ),
  sora: withDomainFallbacks(TOOL_DOMAINS.sora, "https://openai.com/favicon.ico"),
  "openai-platform": withDomainFallbacks(
    TOOL_DOMAINS["openai-platform"],
    "https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg",
  ),
  alphafold: withDomainFallbacks(TOOL_DOMAINS.alphafold, "https://www.ebi.ac.uk/favicon.ico"),
  "meta-ai": withDomainFallbacks(TOOL_DOMAINS["meta-ai"], "https://www.meta.ai/apple-touch-icon.png"),
  "nvidia-nim": withDomainFallbacks(
    TOOL_DOMAINS["nvidia-nim"],
    "https://www.nvidia.com/favicon.ico",
  ),
  mistral: withDomainFallbacks(
    TOOL_DOMAINS.mistral,
    "https://mistral.ai/apple-touch-icon.png",
    "https://chat.mistral.ai/favicon.ico",
  ),
  "hugging-face": withDomainFallbacks(
    TOOL_DOMAINS["hugging-face"],
    "https://huggingface.co/front/assets/huggingface_logo-noborder.svg",
    "https://huggingface.co/favicon.ico",
  ),
  "microsoft-copilot": withDomainFallbacks(
    TOOL_DOMAINS["microsoft-copilot"],
    "https://copilot.microsoft.com/favicon.ico",
  ),
  "azure-openai": withDomainFallbacks(TOOL_DOMAINS["azure-openai"], "https://azure.microsoft.com/favicon.ico"),
  "amazon-bedrock": withDomainFallbacks(TOOL_DOMAINS["amazon-bedrock"], "https://aws.amazon.com/favicon.ico"),
  cohere: withDomainFallbacks(TOOL_DOMAINS.cohere, "https://cohere.com/favicon.ico"),
  groq: withDomainFallbacks(TOOL_DOMAINS.groq, "https://groq.com/favicon.ico"),
  "together-ai": withDomainFallbacks(TOOL_DOMAINS["together-ai"], "https://www.together.ai/favicon.ico"),
  "character-ai": withDomainFallbacks(TOOL_DOMAINS["character-ai"], "https://character.ai/favicon.ico"),
  "stable-diffusion": withDomainFallbacks(TOOL_DOMAINS["stable-diffusion"], "https://stability.ai/favicon.ico"),
  replicate: withDomainFallbacks(TOOL_DOMAINS.replicate, "https://replicate.com/favicon.ico"),
  "fireworks-ai": withDomainFallbacks(TOOL_DOMAINS["fireworks-ai"], "https://fireworks.ai/favicon.ico"),
  langchain: withDomainFallbacks(TOOL_DOMAINS.langchain, "https://www.langchain.com/favicon.ico"),
  "tesla-ai": withDomainFallbacks(TOOL_DOMAINS["tesla-ai"], "https://www.tesla.com/favicon.ico"),
  gemini: withDomainFallbacks(
    TOOL_DOMAINS.gemini,
    "https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg",
    "https://upload.wikimedia.org/wikipedia/commons/1/1d/Google_Gemini_icon_2025.svg",
    "https://www.google.com/favicon.ico",
  ),
  perplexity: withDomainFallbacks(
    TOOL_DOMAINS.perplexity,
    "https://www.perplexity.ai/apple-touch-icon.png",
    "https://www.perplexity.ai/favicon.ico",
  ),
  cursor: withDomainFallbacks(
    TOOL_DOMAINS.cursor,
    "https://www.cursor.com/apple-touch-icon.png",
    "https://cursor.com/favicon.ico",
    "https://avatars.githubusercontent.com/u/159301898?s=200&v=4",
  ),
  "github-copilot": withDomainFallbacks(
    TOOL_DOMAINS["github-copilot"],
    "https://github.githubassets.com/images/modules/site/copilot/copilot.png",
    "https://github.com/favicon.ico",
  ),
  midjourney: withDomainFallbacks(
    TOOL_DOMAINS.midjourney,
    "https://upload.wikimedia.org/wikipedia/commons/e/e6/Midjourney_Emblem.png",
  ),
  kling: withDomainFallbacks(TOOL_DOMAINS.kling, "https://klingai.com/favicon.ico"),
  runway: withDomainFallbacks(
    TOOL_DOMAINS.runway,
    "https://app.runwayml.com/favicon.ico",
    "https://runwayml.com/favicon.ico",
  ),
  elevenlabs: withDomainFallbacks(TOOL_DOMAINS.elevenlabs, "https://elevenlabs.io/favicon.ico"),
  zapier: withDomainFallbacks(
    TOOL_DOMAINS.zapier,
    "https://cdn.zapier.com/zapier/images/favicon.ico",
    "https://upload.wikimedia.org/wikipedia/commons/7/7d/Zapier_logo.svg",
  ),
  "zapier-agents": withDomainFallbacks(
    TOOL_DOMAINS["zapier-agents"],
    "https://cdn.zapier.com/zapier/images/favicon.ico",
    "https://upload.wikimedia.org/wikipedia/commons/7/7d/Zapier_logo.svg",
  ),
  lindy: withDomainFallbacks(TOOL_DOMAINS.lindy),
  n8n: withDomainFallbacks(
    TOOL_DOMAINS.n8n,
    "https://upload.wikimedia.org/wikipedia/commons/5/53/N8n-logo-new.svg",
    "https://n8n.io/favicon.ico",
  ),
  openrouter: withDomainFallbacks(
    TOOL_DOMAINS.openrouter,
    "https://openrouter.ai/apple-touch-icon.png",
    "https://openrouter.ai/favicon-32x32.png",
  ),
  synthesia: withDomainFallbacks(TOOL_DOMAINS.synthesia),
  "the-rundown-ai": withDomainFallbacks(TOOL_DOMAINS["the-rundown-ai"]),
  "tldr-ai": withDomainFallbacks(TOOL_DOMAINS["tldr-ai"]),
  "mit-tech-review-ai": withDomainFallbacks(
    TOOL_DOMAINS["mit-tech-review-ai"],
    "https://upload.wikimedia.org/wikipedia/commons/0/0c/MIT_Technology_Review_logo.svg",
  ),
};

/** Primary URL per slug (first candidate). */
export const KNOWN_TOOL_LOGO_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWN_TOOL_LOGO_CANDIDATES).map(([slug, urls]) => [slug, urls[0]!]),
);

type LogoSource = "db" | "slug" | "name-key" | "heuristic" | "domain";

function slugHeuristicCandidates(key: string, name: string): readonly string[] | null {
  if (/^claude/i.test(name) && !/artifact/i.test(key)) return KNOWN_TOOL_LOGO_CANDIDATES.claude;
  if (/chatgpt|^gpt$/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.chatgpt;
  if (/grok|x\s*ai/i.test(name) || key === "grok" || key === "xai") {
    return KNOWN_TOOL_LOGO_CANDIDATES.xai;
  }
  if (/mistral/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.mistral;
  if (/hugging\s*face/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES["hugging-face"];
  if (/cohere/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.cohere;
  if (/bedrock/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES["amazon-bedrock"];
  if (/replicate/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.replicate;
  if (/langchain/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.langchain;
  if (/character\.?ai/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES["character-ai"];
  if (/stable\s*diffusion|stability/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES["stable-diffusion"];
  if (/gemini/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.gemini;
  if (/perplexity/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.perplexity;
  if (/copilot/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES["github-copilot"];
  if (/cursor/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.cursor;
  if (/midjourney/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.midjourney;
  if (/elevenlabs/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.elevenlabs;
  if (/runway/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.runway;
  if (/kling/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.kling;
  if (/zapier/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.zapier;
  if (/lindy/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.lindy;
  if (/n8n/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.n8n;
  if (/openrouter/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.openrouter;
  if (/synthesia/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES.synthesia;
  if (/rundown/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES["the-rundown-ai"];
  if (/tldr/i.test(name)) return KNOWN_TOOL_LOGO_CANDIDATES["tldr-ai"];
  return null;
}

function normalizeSlugKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Resolve ordered logo URL candidates: DB → slug map → name key → heuristics → domain fallbacks. */
export function resolveToolLogoUrls(
  slug: string,
  name: string,
  storedUrl?: string | null,
): string[] {
  const key = slug.trim().toLowerCase();
  const stored = storedUrl?.trim();
  const candidates: string[] = [];

  if (stored && !isLikelyBrokenLogoUrl(stored)) candidates.push(stored);

  const slugCandidates = KNOWN_TOOL_LOGO_CANDIDATES[key];
  if (slugCandidates) candidates.push(...slugCandidates);

  const nameKey = normalizeSlugKey(name);
  const nameCandidates = KNOWN_TOOL_LOGO_CANDIDATES[nameKey];
  if (nameCandidates) candidates.push(...nameCandidates);

  const heuristic = slugHeuristicCandidates(key, name);
  if (heuristic) candidates.push(...heuristic);

  const domain = TOOL_DOMAINS[key];
  if (domain && !slugCandidates) candidates.push(...domainFallbacks(domain));

  if (stored && isLikelyBrokenLogoUrl(stored)) candidates.push(stored);

  return dedupeUrls(candidates);
}

/** Resolve the best single logo URL (primary candidate). */
export function resolveToolLogoUrl(
  slug: string,
  name: string,
  storedUrl?: string | null,
): string | null {
  const urls = resolveToolLogoUrls(slug, name, storedUrl);
  const resolved = urls[0] ?? null;

  let source: LogoSource | null = null;
  const key = slug.trim().toLowerCase();
  if (storedUrl?.trim() && !isLikelyBrokenLogoUrl(storedUrl)) source = "db";
  else if (KNOWN_TOOL_LOGO_CANDIDATES[key]) source = "slug";
  else if (KNOWN_TOOL_LOGO_CANDIDATES[normalizeSlugKey(name)]) source = "name-key";
  else if (slugHeuristicCandidates(key, name)) source = "heuristic";
  else if (TOOL_DOMAINS[key]) source = "domain";

  if (import.meta.env.DEV) {
    console.log("[toolLogos] resolve", {
      slug: key,
      name,
      source,
      primary: resolved,
      totalCandidates: urls.length,
    });
  }

  return resolved;
}
