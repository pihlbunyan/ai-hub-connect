-- Expand PiHLAI tools directory (2026): major labs, cloud AI, creative, and infra.
-- Covers companies aligned with OFFICIAL_X_ACCOUNTS plus retained high-value directory tools.
-- Safe to re-run: upsert by slug.

INSERT INTO public.tools (
  name, slug, vendor, category, description_short, discover_summary, pro_summary,
  url, pro_tags, discover_tags, rating, cost_tier, audience
) VALUES
-- Anthropic
('Claude','claude','Anthropic','Chat & Reasoning','Anthropic''s flagship assistant for careful reasoning and long documents.','A thoughtful AI helper that''s great at writing, explaining, and working through complex questions step by step.','Claude 4 family, 200k+ context, strong tool use and vision, excellent for code, analysis, agents, and enterprise deployments via API.','https://claude.ai',ARRAY['200k-context','tool-use','vision','agents'],ARRAY['friendly','careful'],4.8,'freemium','both'),
('Claude Artifacts','claude-artifacts','Anthropic','Coding & Building','Build and preview apps, charts, and UI inside Claude chats.','Turns your ideas into little interactive demos you can try right in the chat.','Live HTML/React/SVG/Mermaid previews, rapid prototyping, shareable artifacts, pairs with Claude coding workflows.','https://claude.ai',ARRAY['live-preview','react','prototyping'],ARRAY['sandbox','builder'],4.7,'freemium','pro'),

-- OpenAI
('ChatGPT','chatgpt','OpenAI','Chat & Reasoning','OpenAI''s general-purpose assistant used by millions worldwide.','Ask anything — writing help, ideas, learning, coding basics, and everyday tasks.','GPT-4.1 / o-series reasoning, Advanced Voice, memory, custom GPTs, code interpreter, image input, and broad plugin ecosystem.','https://chat.openai.com',ARRAY['reasoning','custom-gpts','multimodal','code-interpreter'],ARRAY['easy','popular'],4.7,'freemium','both'),
('DALL·E','dall-e','OpenAI','Creative & Media','OpenAI''s image generation inside ChatGPT and the API.','Describe a picture and get AI art in seconds.','Native ChatGPT image gen, inpainting/editing flows, API access, strong prompt adherence for marketing and design.','https://openai.com/dall-e-3',ARRAY['image-gen','editing','api'],ARRAY['art','images'],4.6,'freemium','both'),
('Sora','sora','OpenAI','Creative & Media','OpenAI''s text-to-video model for cinematic clips.','Type what you want to see and get a short AI video.','High-fidelity video generation, storyboard-style prompts, improving temporal consistency; access via ChatGPT tiers and API rollouts.','https://openai.com/sora',ARRAY['text-to-video','cinematic','api'],ARRAY['video','creative'],4.5,'paid','both'),
('OpenAI Platform','openai-platform','OpenAI','Specialized','APIs and developer tools for GPT, embeddings, and agents.','The developer toolkit behind ChatGPT — build your own AI features.','Assistants API, Responses API, fine-tuning, batch, evals, Realtime API, enterprise compliance, and model routing across GPT and reasoning tiers.','https://platform.openai.com',ARRAY['api','assistants','fine-tuning','enterprise'],ARRAY['developers'],4.8,'paid','pro'),

-- xAI
('Grok','grok','xAI','Chat & Reasoning','xAI''s assistant with real-time knowledge from X.','An AI that knows what''s trending and answers with personality.','Grok 3+ models, live X/web context, strong reasoning and coding, API access for builders, competitive latency on Groq hardware.','https://grok.x.ai',ARRAY['real-time','x-integration','api'],ARRAY['live','witty'],4.5,'freemium','both'),

-- Google
('Gemini','gemini','Google DeepMind','Chat & Reasoning','Google''s multimodal AI across Search, Android, and Workspace.','Google''s AI helper in Gmail, Docs, and your phone.','Gemini 2.5 Pro/Flash, 1M+ token context, deep Workspace and Cloud integration, strong multimodal and coding benchmarks.','https://gemini.google.com',ARRAY['1m-context','workspace','multimodal','cloud'],ARRAY['google','everywhere'],4.6,'freemium','both'),
('AlphaFold','alphafold','Google DeepMind','Research & Knowledge','Breakthrough protein structure prediction for life sciences.','AI that helps scientists understand how proteins fold — a huge biology breakthrough.','Industry-standard structure prediction, AlphaFold Server, open models and DB, widely used in drug discovery and academic research.','https://alphafold.ebi.ac.uk',ARRAY['biology','open-science','structures'],ARRAY['science','research'],4.9,'free','pro'),

-- Meta
('Meta AI','meta-ai','Meta AI','Chat & Reasoning','Meta''s assistant powered by Llama across apps and the web.','Talk to Meta''s AI in WhatsApp, Instagram, and the web — free and fast.','Llama 4 family, on-device and cloud inference, open-weight releases, strong multilingual chat and image features in Meta apps.','https://meta.ai',ARRAY['llama','open-weights','multimodal'],ARRAY['social','free'],4.4,'free','both'),

-- NVIDIA
('NVIDIA NIM','nvidia-nim','NVIDIA','Specialized','Optimized inference microservices for deploying AI models on NVIDIA GPUs.','Run AI models blazing fast on NVIDIA chips in the cloud or your servers.','Prebuilt NIM containers, TensorRT-LLM, enterprise support, integrates with AWS/Azure/GCP and on-prem DGX for production LLM/VLM serving.','https://developer.nvidia.com/nim',ARRAY['inference','tensorrt','enterprise','gpu'],ARRAY['infrastructure'],4.7,'paid','pro'),

-- Mistral
('Mistral Le Chat','mistral','Mistral AI','Chat & Reasoning','Mistral''s efficient European frontier models and chat product.','A fast, capable chat AI from one of Europe''s top AI labs.','Mistral Large / Medium, Mixtral MoE heritage, strong multilingual and coding, competitive API pricing, EU data residency options.','https://chat.mistral.ai',ARRAY['mixtral','multilingual','api','eu'],ARRAY['fast','european'],4.6,'freemium','both'),

-- Hugging Face
('Hugging Face','hugging-face','Hugging Face','Specialized','The open platform for models, datasets, Spaces, and ML tools.','GitHub for AI models — download, try, and share thousands of models.','Model Hub, Transformers, Datasets, Spaces demos, Inference Endpoints, Enterprise Hub, and the de facto open ML community.','https://huggingface.co',ARRAY['open-source','hub','transformers','spaces'],ARRAY['community','developers'],4.8,'freemium','both'),

-- Microsoft
('Microsoft Copilot','microsoft-copilot','Microsoft','Chat & Reasoning','AI assistant across Windows, M365, Edge, and business apps.','Your AI copilot in Word, Excel, Teams, and Windows.','Copilot for M365, Graph-grounded enterprise search, security/compliance, integration with Azure OpenAI and GitHub Copilot for dev workflows.','https://copilot.microsoft.com',ARRAY['m365','enterprise','graph','windows'],ARRAY['work','office'],4.5,'freemium','both'),
('GitHub Copilot','github-copilot','Microsoft','Coding & Building','AI pair programmer inside VS Code, JetBrains, and GitHub.','Auto-completes and explains code as you type.','Copilot Chat, agent mode, Workspace awareness, enterprise policies, and deep GitHub integration for teams.','https://github.com/features/copilot',ARRAY['ide','agents','enterprise'],ARRAY['coding','autocomplete'],4.6,'paid','pro'),
('Azure OpenAI Service','azure-openai','Microsoft','Specialized','Enterprise OpenAI models on Microsoft Azure with governance controls.','Run ChatGPT-class models inside your company''s Azure cloud.','Private networking, RBAC, content filtering, regional deployment, PTU throughput, and unified billing with Microsoft enterprise agreements.','https://azure.microsoft.com/products/ai-services/openai-service',ARRAY['enterprise','private','compliance','azure'],ARRAY['cloud','business'],4.7,'paid','pro'),

-- AWS
('Amazon Bedrock','amazon-bedrock','Amazon Web Services','Specialized','Managed foundation models and agents on AWS.','Pick from many AI models inside AWS without running servers yourself.','Claude, Llama, Titan, and more via unified API; Knowledge Bases, Guardrails, Agents, and tight IAM/VPC integration for regulated workloads.','https://aws.amazon.com/bedrock',ARRAY['multi-model','agents','rag','enterprise'],ARRAY['aws','cloud'],4.6,'paid','pro'),

-- Cohere
('Cohere','cohere','Cohere','Chat & Reasoning','Enterprise-focused LLMs, embeddings, and RAG for business.','AI built for companies that need secure, reliable language models.','Command R+, embed v3, rerank, North assistant platform, strong retrieval workflows, and deployment options for regulated industries.','https://cohere.com',ARRAY['enterprise','rag','embeddings','rerank'],ARRAY['business','search'],4.5,'paid','pro'),

-- Groq
('GroqCloud','groq','Groq','Specialized','Ultra-low-latency LLM inference on Groq LPU hardware.','The fastest place to run open models for chat and apps.','LPU inference, competitive $/token, OpenAI-compatible API, hosts Llama, Mixtral, and partners; ideal for real-time agents and voice.','https://groq.com',ARRAY['lpu','low-latency','api','open-models'],ARRAY['fast','developers'],4.6,'freemium','pro'),

-- Together AI
('Together AI','together-ai','Together AI','Specialized','Cloud for running and fine-tuning open-source models.','Rent GPUs and run open models without managing clusters yourself.','Hundreds of open models, fine-tuning, dedicated endpoints, competitive pricing, popular for startups shipping open-weight stacks.','https://www.together.ai',ARRAY['open-models','fine-tuning','gpu','api'],ARRAY['developers','startups'],4.5,'paid','pro'),

-- Creative
('Midjourney','midjourney','Midjourney','Creative & Media','Leading aesthetic text-to-image generator.','Describe an image and get stunning art in seconds.','v7 aesthetics, style references, character consistency, web editor, strong community prompt craft for design and marketing.','https://midjourney.com',ARRAY['style-ref','v7','editor'],ARRAY['art','images'],4.8,'paid','both'),
('Runway','runway','Runway','Creative & Media','Professional AI video generation and editing.','Hollywood-style AI video tools for creators and teams.','Gen-4 / Aleph, Act-One performance capture, multi-motion brush, VFX, and collaborative video workflows for studios and marketers.','https://runwayml.com',ARRAY['gen-4','video','vfx','studio'],ARRAY['filmmaking','video'],4.6,'paid','pro'),
('Stable Diffusion','stable-diffusion','Stability AI','Creative & Media','Open image generation ecosystem with SDXL and Stable Image.','Popular open-source style AI art you can run locally or online.','SDXL, Stable Image services, ControlNet ecosystem, self-host friendly, widely used in indie games, design, and research.','https://stability.ai',ARRAY['open-weights','sdxl','controlnet'],ARRAY['open-source','art'],4.5,'freemium','both'),
('ElevenLabs','elevenlabs','ElevenLabs','Creative & Media','Industry-leading AI voice, dubbing, and conversational audio.','Clone voices and make lifelike speech in many languages.','Eleven v3, instant voice clone, dubbing studio, conversational AI agents, and robust APIs for media and support automation.','https://elevenlabs.io',ARRAY['voice-clone','dubbing','agents-api'],ARRAY['audio','voices'],4.8,'freemium','both'),
('Kling AI','kling','Kuaishou','Creative & Media','High-quality AI video from text and images.','Turn prompts or photos into short cinematic clips.','Kling 2.x, image-to-video, lip sync, motion control; strong value for social and ads versus premium studio tools.','https://klingai.com',ARRAY['i2v','lip-sync','motion'],ARRAY['video','easy'],4.5,'freemium','both'),

-- Search & chat products
('Perplexity','perplexity','Perplexity AI','Chat & Reasoning','Answer engine with live web search and citations.','Like search, but it writes a clear answer with sources.','Sonar models, Pro Search agents, focus modes, file upload, and strong for research, shopping, and news with verifiable citations.','https://perplexity.ai',ARRAY['citations','sonar','agents'],ARRAY['search','sources'],4.7,'freemium','both'),
('Character.AI','character-ai','Character.AI','Chat & Reasoning','Roleplay and persona chatbots with huge user communities.','Chat with fun characters and custom personalities.','User-created personas, group chat, voice, mobile-first UX, and large engagement for entertainment and creative writing.','https://character.ai',ARRAY['roleplay','personas','community'],ARRAY['fun','social'],4.3,'freemium','discover'),

-- Developer platforms
('Replicate','replicate','Replicate','Specialized','Run open-source models via simple cloud API.','Try thousands of AI models with one API key.','Huge model catalog, Cog containers, fast cold starts, pay-per-second GPU, ideal for prototyping image, video, and LLM features.','https://replicate.com',ARRAY['api','gpu','catalog'],ARRAY['developers','prototyping'],4.6,'paid','pro'),
('Fireworks AI','fireworks-ai','Fireworks AI','Specialized','Fast inference and fine-tuning for open and proprietary models.','Production-grade API for running and customizing AI models.','FireAttention serving, fine-tuning, function calling, compound systems, and strong price/performance for app developers.','https://fireworks.ai',ARRAY['inference','fine-tuning','function-calling'],ARRAY['developers','api'],4.5,'paid','pro'),
('LangChain','langchain','LangChain','Productivity & Automation','Framework and LangSmith platform for LLM applications.','Tooling to chain AI steps together and debug production apps.','LangGraph agents, LangSmith tracing/evals, integrations with every major model, standard stack for RAG and agent engineering teams.','https://www.langchain.com',ARRAY['agents','langgraph','observability','rag'],ARRAY['developers','workflows'],4.6,'freemium','pro'),
('OpenRouter','openrouter','OpenRouter','Specialized','Unified API gateway to hundreds of LLMs.','One API key to access almost every major AI model.','Model routing, fallbacks, cost analytics, OpenAI-compatible surface, ideal for multi-model apps and cost optimization.','https://openrouter.ai',ARRAY['routing','multi-model','byok'],ARRAY['developers'],4.7,'freemium','pro'),

-- Coding
('Cursor','cursor','Anysphere','Coding & Building','AI-native code editor forked from VS Code.','A code editor that writes and refactors projects with you.','Composer agent, codebase indexing, multi-file edits, flexible frontier model choice, and tab completion tuned for shipping features.','https://cursor.com',ARRAY['agent-mode','indexing','vscode-fork'],ARRAY['coding','builder'],4.8,'freemium','pro'),

-- Automation (retained)
('Zapier Agents','zapier-agents','Zapier','Productivity & Automation','No-code AI agents across 8,000+ app integrations.','Connect your apps and let AI agents handle repetitive work.','Multi-step agents, human-in-the-loop, schedules, and the largest SaaS integration catalog for ops and GTM teams.','https://zapier.com/agents',ARRAY['integrations','agents','no-code'],ARRAY['automation'],4.4,'freemium','pro'),
('Lindy','lindy','Lindy','Productivity & Automation','Build AI employees for email, calendar, and sales workflows.','Hire a digital assistant that works inside your existing tools.','Agent builder, phone agents, CRM actions, and templates for support, recruiting, and outbound.','https://lindy.ai',ARRAY['agents','phone','crm'],ARRAY['assistants'],4.5,'paid','pro'),
('n8n','n8n','n8n','Productivity & Automation','Fair-code workflow automation with deep AI node support.','Wire up automations visually, including AI steps.','Self-host or cloud, LangChain nodes, code steps, 400+ integrations, popular for technical teams avoiding lock-in.','https://n8n.io',ARRAY['self-host','langchain','workflows'],ARRAY['automation','technical'],4.7,'freemium','pro'),

-- Research & newsletters (retained)
('The Rundown AI','the-rundown-ai',NULL,'Research & Knowledge','Daily AI industry newsletter and tutorials.','A quick daily email on what matters in AI.','Curated launches, tool breakdowns, and courses for staying current without doom-scrolling.','https://therundown.ai',ARRAY['newsletter','industry'],ARRAY['daily','easy'],4.5,'free','both'),
('TLDR AI','tldr-ai',NULL,'Research & Knowledge','Concise AI news digest for busy readers.','Five-minute summaries of AI news and papers.','High signal-to-noise email digest popular with engineers and PMs tracking the field.','https://tldr.tech/ai',ARRAY['newsletter','summaries'],ARRAY['quick','simple'],4.4,'free','discover'),
('MIT Technology Review AI','mit-tech-review-ai','MIT','Research & Knowledge','Long-form journalism on AI impact and policy.','Thoughtful magazine stories about where AI is heading.','Deep reporting on ethics, policy, labs, and societal impact — strong for strategic readers.','https://www.technologyreview.com/topic/artificial-intelligence/',ARRAY['long-form','policy'],ARRAY['serious','analysis'],4.6,'paid','pro'),

-- Specialized retained
('Synthesia','synthesia','Synthesia','Specialized','AI avatar videos for L&D and corporate comms.','Make training videos with realistic AI presenters.','230+ avatars, multilingual dubbing, brand kits, and enterprise controls for compliance training at scale.','https://www.synthesia.io',ARRAY['avatars','enterprise','l10n'],ARRAY['video','business'],4.6,'paid','both'),

-- Frontier / robotics (curated)
('Tesla AI','tesla-ai','Tesla','Specialized','Tesla''s autonomy, Optimus, and training stack for real-world AI.','The AI behind self-driving Teslas and humanoid robots.','FSD supervised, Dojo training, vision-first autonomy, and Optimus development — leading embodied AI at scale (consumer-facing, not an API product).','https://www.tesla.com/AI',ARRAY['autonomy','robotics','vision'],ARRAY['cars','future'],4.4,'paid','discover')

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  vendor = EXCLUDED.vendor,
  category = EXCLUDED.category,
  description_short = EXCLUDED.description_short,
  discover_summary = EXCLUDED.discover_summary,
  pro_summary = EXCLUDED.pro_summary,
  url = EXCLUDED.url,
  pro_tags = EXCLUDED.pro_tags,
  discover_tags = EXCLUDED.discover_tags,
  rating = EXCLUDED.rating,
  cost_tier = EXCLUDED.cost_tier,
  audience = EXCLUDED.audience,
  updated_at = now();
