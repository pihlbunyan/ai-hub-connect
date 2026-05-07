
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
CREATE TYPE public.user_mode AS ENUM ('pro','discover');
CREATE TYPE public.cost_tier AS ENUM ('free','freemium','paid','enterprise');
CREATE TYPE public.tool_audience AS ENUM ('pro','discover','both');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  mode public.user_mode NOT NULL DEFAULT 'discover',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Profile auto-create on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Tools
CREATE TABLE public.tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  vendor TEXT,
  category TEXT NOT NULL,
  description_short TEXT NOT NULL,
  description_long TEXT,
  discover_summary TEXT,
  pro_summary TEXT,
  url TEXT,
  logo_url TEXT,
  pro_tags TEXT[] NOT NULL DEFAULT '{}',
  discover_tags TEXT[] NOT NULL DEFAULT '{}',
  rating NUMERIC(2,1) NOT NULL DEFAULT 4.5,
  cost_tier public.cost_tier NOT NULL DEFAULT 'freemium',
  audience public.tool_audience NOT NULL DEFAULT 'both',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tools_select_all" ON public.tools FOR SELECT USING (true);
CREATE POLICY "tools_admin_write" ON public.tools FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Reviews
CREATE TABLE public.tool_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tool_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select_all" ON public.tool_reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert_own" ON public.tool_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews_update_own" ON public.tool_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "reviews_delete_own" ON public.tool_reviews FOR DELETE USING (auth.uid() = user_id);

-- Favorites
CREATE TABLE public.favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, tool_id)
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fav_select_own" ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fav_insert_own" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fav_delete_own" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

-- Chats
CREATE TABLE public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  models_used TEXT[] NOT NULL DEFAULT '{}',
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  tokens_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chats_select_own" ON public.chats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chats_insert_own" ON public.chats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chats_delete_own" ON public.chats FOR DELETE USING (auth.uid() = user_id);

-- Seed tools
INSERT INTO public.tools (name, slug, vendor, category, description_short, discover_summary, pro_summary, url, pro_tags, discover_tags, rating, cost_tier, audience) VALUES
('Claude','claude','Anthropic','Chat & Reasoning','Anthropic''s flagship reasoning model with long-context analysis.','A super smart writing and thinking buddy that''s great at long, careful answers.','Frontier LLM with 200k context, strong tool use, excellent for code review, legal/technical drafting, RAG.','https://claude.ai',ARRAY['200k-context','tool-use','XML-prompts','vision'],ARRAY['friendly','careful'],4.8,'freemium','pro'),
('ChatGPT','chatgpt','OpenAI','Chat & Reasoning','The most popular general-purpose AI assistant.','Ask anything — writing, ideas, homework help, recipes.','GPT-5 family, code interpreter, custom GPTs, plugins, multimodal I/O.','https://chat.openai.com',ARRAY['code-interpreter','custom-gpts','assistants-api'],ARRAY['easy','popular'],4.7,'freemium','both'),
('Grok 4','grok','xAI','Chat & Reasoning','xAI''s real-time, X-integrated assistant.','Knows what''s happening on social media right now.','Live web/X access, function calling, competitive reasoning benchmarks.','https://grok.x.ai',ARRAY['real-time','function-calling','x-integration'],ARRAY['live','witty'],4.4,'paid','both'),
('Gemini','gemini','Google','Chat & Reasoning','Google''s multimodal AI integrated with Workspace.','Helps in Gmail, Docs, and Search — like a Google-powered helper.','Gemini 2.5 Pro, native multimodal, 1M+ token context, Workspace integration.','https://gemini.google.com',ARRAY['1m-context','workspace','multimodal'],ARRAY['google','everywhere'],4.6,'freemium','both'),
('Perplexity','perplexity','Perplexity AI','Chat & Reasoning','AI search engine with cited answers.','Like Google but it answers your question with sources.','Sonar models, multi-source retrieval, focus modes, Pro Search agent.','https://perplexity.ai',ARRAY['rag','citations','sonar'],ARRAY['search','sources'],4.7,'freemium','both'),
('Cursor','cursor','Anysphere','Coding & Building','AI-first code editor built on VS Code.','A coding app that writes code with you.','Composer, agent mode, codebase indexing, multi-file edits, tab completion.','https://cursor.sh',ARRAY['agent-mode','codebase-rag','vscode-fork'],ARRAY['coding'],4.8,'freemium','pro'),
('GitHub Copilot','github-copilot','GitHub','Coding & Building','Inline AI code completion across IDEs.','Auto-completes code as you type.','Copilot Chat, Workspace, enterprise SKUs, IDE integrations.','https://github.com/features/copilot',ARRAY['ide-integration','enterprise','chat'],ARRAY['autocomplete'],4.5,'paid','pro'),
('Claude Artifacts','claude-artifacts','Anthropic','Coding & Building','Interactive code/UI sandbox inside Claude.','Builds little apps right in the chat for you to try.','Live preview of HTML/React/SVG/Mermaid generated by Claude.','https://claude.ai',ARRAY['live-preview','react','svg'],ARRAY['sandbox'],4.6,'freemium','pro'),
('Midjourney','midjourney','Midjourney','Creative & Media','Premier text-to-image generator.','Type a description, get a beautiful picture.','v7 model, style references, image weights, Discord + Web UI.','https://midjourney.com',ARRAY['style-ref','seeds','remix'],ARRAY['art','images'],4.8,'paid','both'),
('Kling AI','kling','Kuaishou','Creative & Media','High-fidelity AI video generation.','Turn a sentence into a short video clip.','Kling 1.6 Pro, image-to-video, motion brush, lip sync.','https://klingai.com',ARRAY['i2v','motion-brush','lip-sync'],ARRAY['video','easy'],4.5,'freemium','both'),
('Runway','runway','Runway','Creative & Media','Pro AI video, editing, and effects suite.','Movie-magic editing powered by AI.','Gen-4, Act-One, multi-motion brush, green screen, frame interpolation.','https://runwayml.com',ARRAY['gen-4','act-one','vfx'],ARRAY['filmmaking'],4.6,'paid','pro'),
('ElevenLabs','elevenlabs','ElevenLabs','Creative & Media','Best-in-class AI voice generation and cloning.','Make any voice say anything.','Multilingual v2, voice cloning, dubbing, conversational agents API.','https://elevenlabs.io',ARRAY['voice-cloning','dubbing','agents-api'],ARRAY['voices','audio'],4.8,'freemium','both'),
('Zapier Agents','zapier-agents','Zapier','Productivity & Automation','AI agents across 7000+ app integrations.','Robots that connect your apps and do tasks for you.','Multi-step agents, tools across Zapier ecosystem, triggers & schedules.','https://zapier.com/agents',ARRAY['7000+integrations','agents','triggers'],ARRAY['automation'],4.4,'freemium','pro'),
('Lindy','lindy','Lindy','Productivity & Automation','Build no-code AI employees and workflows.','Hire a digital assistant in minutes.','Agent builder, Gmail/Calendar/CRM tools, phone agents, multi-agent.','https://lindy.ai',ARRAY['agent-builder','phone','crm'],ARRAY['assistants'],4.5,'paid','pro'),
('n8n','n8n','n8n','Productivity & Automation','Open-source workflow automation with AI nodes.','Drag-and-drop way to wire up automations.','Self-hostable, LangChain nodes, code nodes, 400+ integrations.','https://n8n.io',ARRAY['self-host','langchain','open-source'],ARRAY['workflows'],4.7,'freemium','pro'),
('The Rundown AI','the-rundown-ai',null,'Research & Knowledge','Daily AI news + tutorials newsletter.','A short daily email that tells you what''s new in AI.','Curated industry signal, deep-dives, tool comparisons, courses.','https://therundown.ai',ARRAY['newsletter','industry'],ARRAY['daily','easy'],4.5,'free','both'),
('TLDR AI','tldr-ai',null,'Research & Knowledge','5-minute AI news digest.','The shortest way to keep up with AI.','Concise summaries of papers, launches, and tooling.','https://tldr.tech/ai',ARRAY['summaries'],ARRAY['quick','simple'],4.4,'free','discover'),
('MIT Technology Review AI','mit-tech-review-ai','MIT','Research & Knowledge','In-depth AI journalism and analysis.','Big magazine-style stories about how AI is changing the world.','Long-form reporting, policy, research breakdowns, interviews.','https://technologyreview.com/topic/artificial-intelligence',ARRAY['long-form','policy','research'],ARRAY['serious'],4.6,'paid','pro'),
('OpenRouter','openrouter','OpenRouter','Specialized','Unified API for hundreds of LLMs.','One key, every AI model.','Provider routing, fallbacks, cost analytics, OpenAI-compatible API.','https://openrouter.ai',ARRAY['unified-api','routing','byok'],ARRAY['developer'],4.7,'freemium','pro'),
('Synthesia','synthesia','Synthesia','Specialized','AI avatar video generator for training and marketing.','Make videos with realistic AI presenters.','230+ avatars, 140+ languages, custom avatars, brand kits.','https://synthesia.io',ARRAY['avatars','enterprise','localization'],ARRAY['videos','presenters'],4.6,'paid','both');
