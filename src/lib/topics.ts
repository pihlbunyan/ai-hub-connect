import { pickDepthLabel } from "@/lib/depth";

/**
 * Curated (static) AI topics. Dynamic trending topics live in `trending_topics` (see trendingTopics.ts).
 */
export type Topic = {
  slug: string;
  popularity: number;
  discoverTitle: string;
  discoverBlurb: string;
  discoverDescription: string;
  proTitle: string;
  proBlurb: string;
  proDescription: string;
  relatedToolSlugs: string[];
  tutorials: string[];
  externalLinks: { label: string; url: string }[];
  latestNews: string[];
  suggestedPrompts: { discover: string; pro: string };
};

export const TOPICS: Topic[] = [
  {
    slug: "ai-image-edits",
    popularity: 98,
    discoverTitle: "How can AI alter images for me?",
    discoverBlurb: "Learn simple ways to retouch photos, swap backgrounds, and generate image variations.",
    discoverDescription:
      "This topic covers practical image editing workflows with AI, including enhancement, cleanup, and style transfers. You will learn how to choose tools based on speed, quality, and ease of use.",
    proTitle: "Production image transformation pipelines",
    proBlurb: "Explore model choices, prompt controls, and quality checks for high-volume image edits.",
    proDescription:
      "This topic focuses on operational image transformation systems: prompt templates, model routing, deterministic quality controls, and post-processing review loops for consistent output.",
    relatedToolSlugs: ["midjourney", "runway", "synthesia"],
    tutorials: ["Prompting for reliable image edits", "Style consistency across batches", "Quality review checklist"],
    externalLinks: [{ label: "OpenAI image guidance", url: "https://platform.openai.com/docs/guides/images" }],
    latestNews: ["New editing controls in creative AI tools", "Improved image consistency across reruns"],
    suggestedPrompts: {
      discover: "Give me a beginner workflow for editing photos with AI tools.",
      pro: "Design a production-ready image transformation pipeline with QA guardrails.",
    },
  },
  {
    slug: "building-ai-agents",
    popularity: 96,
    discoverTitle: "Building AI agents",
    discoverBlurb: "Understand what AI agents are and how they can automate everyday tasks.",
    discoverDescription:
      "Learn how agents can break down tasks, use tools, and complete multistep work. This section emphasizes setup basics, safety, and practical starter use cases.",
    proTitle: "Building reliable agent systems",
    proBlurb: "Design tool-calling, state, evaluation loops, and guardrails for agent orchestration.",
    proDescription:
      "Covers architecture for robust agents: planning policies, memory/state boundaries, external tool contracts, observability, and regression testing for reliability.",
    relatedToolSlugs: ["cursor", "n8n", "zapier-agents"],
    tutorials: ["Agent basics for non-engineers", "Defining tool permissions", "Evaluation loops for agent quality"],
    externalLinks: [{ label: "Anthropic agent patterns", url: "https://www.anthropic.com/engineering" }],
    latestNews: ["Agent frameworks adding better observability", "Tool-calling reliability benchmarks"],
    suggestedPrompts: {
      discover: "Explain AI agents to me and help me build my first simple one.",
      pro: "Outline a resilient agent architecture with retries, logging, and policy enforcement.",
    },
  },
  {
    slug: "content-creation",
    popularity: 94,
    discoverTitle: "AI for content creation",
    discoverBlurb: "Use AI to brainstorm posts, draft scripts, and create better content faster.",
    discoverDescription:
      "Great for creators and teams who need a faster content workflow. Learn ideation, drafting, and editing patterns that keep your tone and intent clear.",
    proTitle: "AI content pipelines for teams",
    proBlurb: "Set up repeatable workflows for ideation, drafting, QA, and brand-safe publishing.",
    proDescription:
      "Focuses on scalable content operations: campaign planning, structured prompts, editorial QA gates, and publishing automation with measurable quality metrics.",
    relatedToolSlugs: ["chatgpt", "claude", "the-rundown-ai"],
    tutorials: ["From idea to final draft", "Maintaining brand voice", "Editorial QA with AI"],
    externalLinks: [{ label: "Google AI writing tips", url: "https://blog.google/technology/ai/" }],
    latestNews: ["Content models improve long-form coherence", "Team collaboration features expand"],
    suggestedPrompts: {
      discover: "Help me create a weekly content plan with easy steps.",
      pro: "Build a repeatable multi-channel content pipeline with QA and approval stages.",
    },
  },
  {
    slug: "resume-career",
    popularity: 89,
    discoverTitle: "AI for resumes and job search",
    discoverBlurb: "Get help tailoring resumes, cover letters, and interview practice plans.",
    discoverDescription:
      "Practical guidance for improving resumes, preparing job applications, and practicing interviews with AI as a coach.",
    proTitle: "Career acceleration workflows with AI",
    proBlurb: "Use structured prompts and role-specific templates for targeted career outcomes.",
    proDescription:
      "Build role-specific application systems, reusable interview prep frameworks, and personal positioning documents driven by AI-assisted research.",
    relatedToolSlugs: ["chatgpt", "claude", "perplexity"],
    tutorials: ["Resume rewrite checklist", "Interview roleplay prompts", "Role-fit analysis workflow"],
    externalLinks: [{ label: "LinkedIn AI jobs insights", url: "https://www.linkedin.com/pulse/" }],
    latestNews: ["Hiring teams using AI-assisted screening", "Candidates using AI mock interviews"],
    suggestedPrompts: {
      discover: "Improve my resume and give me a simple interview prep plan.",
      pro: "Create an end-to-end job search operating system tailored to senior roles.",
    },
  },
  {
    slug: "study-learning",
    popularity: 88,
    discoverTitle: "AI for learning faster",
    discoverBlurb: "Turn complex topics into clear explanations and study checklists.",
    discoverDescription:
      "Use AI as a tutor to explain difficult topics, generate examples, and build bite-sized study plans.",
    proTitle: "Adaptive learning systems with LLMs",
    proBlurb: "Apply retrieval, quizzes, and spaced repetition prompts for better retention.",
    proDescription:
      "Design high-retention learning loops with adaptive quizzes, retrieval grounding, and spaced repetition templates.",
    relatedToolSlugs: ["chatgpt", "gemini", "perplexity"],
    tutorials: ["From confusion to concept map", "Self-testing loops", "Retention-focused study prompts"],
    externalLinks: [{ label: "MIT AI learning resources", url: "https://news.mit.edu/topic/artificial-intelligence2" }],
    latestNews: ["Education copilots gaining stronger personalization", "Assessment tooling integrated with LLMs"],
    suggestedPrompts: {
      discover: "Teach me this topic step-by-step with examples and a short quiz.",
      pro: "Create an adaptive learning plan with retrieval tests and spaced repetition intervals.",
    },
  },
  {
    slug: "automation-no-code",
    popularity: 85,
    discoverTitle: "Automate tasks without coding",
    discoverBlurb: "Connect apps and let AI handle repetitive steps for your workflow.",
    discoverDescription:
      "Learn how to automate repetitive tasks using no-code tools and AI assistants with minimal setup.",
    proTitle: "No-code/low-code AI automation architecture",
    proBlurb: "Evaluate trigger reliability, retries, observability, and handoff points.",
    proDescription:
      "Covers robust automation design: event triggers, retries, fallback logic, traceability, and ownership boundaries.",
    relatedToolSlugs: ["zapier-agents", "n8n", "lindy"],
    tutorials: ["First automation in 20 minutes", "Error handling basics", "Monitoring and alerting setup"],
    externalLinks: [{ label: "Zapier AI automation guide", url: "https://zapier.com/blog/ai/" }],
    latestNews: ["No-code agents now support more enterprise apps", "Automation reliability tooling matures"],
    suggestedPrompts: {
      discover: "Help me automate repetitive tasks in my week with no coding.",
      pro: "Design a low-code automation architecture with resilient failure handling.",
    },
  },
  {
    slug: "coding-assistance",
    popularity: 84,
    discoverTitle: "AI coding help for beginners",
    discoverBlurb: "Ask AI to explain code, fix bugs, and scaffold small projects.",
    discoverDescription:
      "A practical on-ramp for coding with AI: from understanding snippets to shipping simple projects.",
    proTitle: "Code generation with review discipline",
    proBlurb: "Use AI for rapid iteration while enforcing tests, static checks, and diff hygiene.",
    proDescription:
      "Focuses on professional code workflows with AI: PR quality controls, automated checks, and maintainability safeguards.",
    relatedToolSlugs: ["cursor", "github-copilot", "claude-artifacts"],
    tutorials: ["Prompting for bug fixes", "Refactor plans with guardrails", "Review checklist before merge"],
    externalLinks: [{ label: "GitHub Copilot resources", url: "https://github.com/resources/articles/ai" }],
    latestNews: ["Coding assistants improve multi-file reasoning", "Editor integrations add stronger context awareness"],
    suggestedPrompts: {
      discover: "Explain this code simply and help me fix one issue at a time.",
      pro: "Propose a safe refactor with tests, edge-case analysis, and rollout plan.",
    },
  },
  {
    slug: "ai-for-business",
    popularity: 82,
    discoverTitle: "Using AI in your business",
    discoverBlurb: "Find practical ways to save time in support, marketing, and operations.",
    discoverDescription:
      "Learn where AI creates immediate business value and how to start with low-risk, high-impact workflows.",
    proTitle: "AI adoption strategy for operations",
    proBlurb: "Prioritize high-ROI workflows, governance, and measurable rollout milestones.",
    proDescription:
      "This topic addresses organizational adoption: use-case prioritization, governance models, KPI frameworks, and change management.",
    relatedToolSlugs: ["openrouter", "perplexity", "chatgpt"],
    tutorials: ["First 30-day AI rollout plan", "Business process mapping for AI", "ROI scorecard setup"],
    externalLinks: [{ label: "McKinsey AI insights", url: "https://www.mckinsey.com/capabilities/quantumblack/our-insights" }],
    latestNews: ["Enterprise AI procurement rising", "Operations teams shifting to copilots"],
    suggestedPrompts: {
      discover: "Help me find 3 easy AI wins for my business this month.",
      pro: "Create an AI adoption roadmap with ROI metrics and governance controls.",
    },
  },
  {
    slug: "multimodal-workflows",
    popularity: 79,
    discoverTitle: "Create with text, image, and audio AI",
    discoverBlurb: "Combine multiple AI tools to produce richer outputs in one workflow.",
    discoverDescription:
      "Understand how to combine text, images, and audio to make more engaging content and outputs.",
    proTitle: "Multimodal workflow composition",
    proBlurb: "Chain text, vision, and audio systems with consistent context passing and QA.",
    proDescription:
      "Covers composable multimodal systems: context handoffs, media transformation stages, and quality gates.",
    relatedToolSlugs: ["elevenlabs", "runway", "midjourney"],
    tutorials: ["Text-to-audio production flow", "Image + script pipeline", "Multimodal quality checklist"],
    externalLinks: [{ label: "Google multimodal AI overview", url: "https://deepmind.google/discover/blog/" }],
    latestNews: ["Faster multimodal generation APIs", "Improved synchronization for audio/video outputs"],
    suggestedPrompts: {
      discover: "Help me build a simple project using text, images, and voice AI together.",
      pro: "Design a multimodal pipeline with deterministic handoffs and quality validation.",
    },
  },
  {
    slug: "privacy-safety",
    popularity: 76,
    discoverTitle: "AI privacy and safety basics",
    discoverBlurb: "Learn what data to avoid sharing and how to use AI more safely.",
    discoverDescription:
      "A practical safety guide for everyday users: private data handling, secure usage habits, and risk awareness.",
    proTitle: "AI risk controls and data governance",
    proBlurb: "Implement policy checks, redaction, and access control in AI-enabled systems.",
    proDescription:
      "Addresses policy and governance controls for production environments, including access controls, redaction, logging, and compliance workflows.",
    relatedToolSlugs: ["openrouter", "claude", "chatgpt"],
    tutorials: ["Safe prompting checklist", "Sensitive data redaction", "Risk review for AI workflows"],
    externalLinks: [{ label: "NIST AI RMF", url: "https://www.nist.gov/itl/ai-risk-management-framework" }],
    latestNews: ["Regulators issue new AI guidance", "Vendors expand privacy controls and audit features"],
    suggestedPrompts: {
      discover: "Give me simple rules to use AI safely with personal and work data.",
      pro: "Create an AI governance control matrix for privacy, security, and compliance.",
    },
  },
];

export function getTopicTitle(topic: Topic, proEnabled: boolean) {
  return pickDepthLabel(topic.discoverTitle, topic.proTitle, proEnabled);
}

export function getTopicBlurb(topic: Topic, proEnabled: boolean) {
  return pickDepthLabel(topic.discoverBlurb, topic.proBlurb, proEnabled);
}

export function getTopicDescription(topic: Topic, proEnabled: boolean) {
  return pickDepthLabel(topic.discoverDescription, topic.proDescription, proEnabled);
}
