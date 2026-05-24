-- Backfill official logo URLs for all seeded tools (idempotent, force-updates known slugs).

UPDATE public.tools SET logo_url = 'https://claude.ai/images/claude_app_icon.png'
WHERE slug IN ('claude', 'claude-artifacts');

UPDATE public.tools SET logo_url = 'https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg'
WHERE slug = 'chatgpt';

UPDATE public.tools SET logo_url = 'https://x.ai/favicon.ico'
WHERE slug = 'grok';

UPDATE public.tools SET logo_url = 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg'
WHERE slug = 'gemini';

UPDATE public.tools SET logo_url = 'https://www.perplexity.ai/apple-touch-icon.png'
WHERE slug = 'perplexity';

UPDATE public.tools SET logo_url = 'https://www.cursor.com/apple-touch-icon.png'
WHERE slug = 'cursor';

UPDATE public.tools SET logo_url = 'https://github.githubassets.com/images/modules/site/copilot/copilot.png'
WHERE slug = 'github-copilot';

UPDATE public.tools SET logo_url = 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Midjourney_Emblem.png'
WHERE slug = 'midjourney';

UPDATE public.tools SET logo_url = 'https://klingai.com/favicon.ico'
WHERE slug = 'kling';

UPDATE public.tools SET logo_url = 'https://app.runwayml.com/favicon.ico'
WHERE slug = 'runway';

UPDATE public.tools SET logo_url = 'https://elevenlabs.io/favicon.ico'
WHERE slug = 'elevenlabs';

UPDATE public.tools SET logo_url = 'https://cdn.zapier.com/zapier/images/favicon.ico'
WHERE slug = 'zapier-agents';

UPDATE public.tools SET logo_url = 'https://icons.duckduckgo.com/ip3/lindy.ai.ico'
WHERE slug = 'lindy';

UPDATE public.tools SET logo_url = 'https://upload.wikimedia.org/wikipedia/commons/5/53/N8n-logo-new.svg'
WHERE slug = 'n8n';

UPDATE public.tools SET logo_url = 'https://openrouter.ai/apple-touch-icon.png'
WHERE slug = 'openrouter';

UPDATE public.tools SET logo_url = 'https://icons.duckduckgo.com/ip3/synthesia.io.ico'
WHERE slug = 'synthesia';

UPDATE public.tools SET logo_url = 'https://icons.duckduckgo.com/ip3/therundown.ai.ico'
WHERE slug = 'the-rundown-ai';

UPDATE public.tools SET logo_url = 'https://icons.duckduckgo.com/ip3/tldr.tech.ico'
WHERE slug = 'tldr-ai';

UPDATE public.tools SET logo_url = 'https://upload.wikimedia.org/wikipedia/commons/0/0c/MIT_Technology_Review_logo.svg'
WHERE slug = 'mit-tech-review-ai';
