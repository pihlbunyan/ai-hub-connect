import { pickDepthLabel } from "@/lib/depth";

export const PROMPT_CATEGORIES = [
  "Content",
  "Coding",
  "Learning",
  "Agents",
  "Image",
  "Business",
  "Productivity",
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export type PromptItem = {
  id: string;
  category: PromptCategory;
  title: string;
  description: string;
  discoverPrompt: string;
  proPrompt: string;
  discoverHelp: string;
  proNotes: string;
};

export const PROMPTS: PromptItem[] = [
  {
    id: "content-weekly-newsletter",
    category: "Content",
    title: "Weekly Newsletter Draft",
    description: "Turn rough notes into a polished newsletter with sections and CTA.",
    discoverPrompt:
      "Help me write a friendly weekly newsletter for [audience]. Use these notes: [notes]. Keep it simple, clear, and around 350-500 words. Include a short intro, 3 key updates, and one call-to-action at the end.",
    proPrompt:
      "You are a senior content strategist. Generate a 500-word weekly newsletter for [audience] from these source notes: [notes]. Output in Markdown with sections: Hook, Signals, Analysis, Actions. Keep brand voice [voice], include 3 measurable CTA options, and return an A/B subject line set (5 variants).",
    discoverHelp: "Great for creating easy-to-read updates without overthinking structure.",
    proNotes: "Use explicit output sections + A/B subjects for better conversion testing.",
  },
  {
    id: "content-linkedin-post",
    category: "Content",
    title: "LinkedIn Post Generator",
    description: "Create a high-signal post with hook, proof, and engagement question.",
    discoverPrompt:
      "Write a LinkedIn post about [topic] for [audience]. Make it conversational and easy to understand. Use a strong opening line, 3 short points, and end with one question to encourage comments.",
    proPrompt:
      "Act as a B2B growth writer. Create 3 LinkedIn post variants on [topic] for [ICP]. Constraints: <= 1200 chars each, first line must be a pattern interrupt, include one data-backed claim and one practical takeaway, end with a low-friction engagement prompt. Return variant goals and predicted performance rationale.",
    discoverHelp: "Use this when you need a post quickly and want a natural tone.",
    proNotes: "Multi-variant output helps you test format/angle against your audience.",
  },
  {
    id: "coding-debug-root-cause",
    category: "Coding",
    title: "Root-Cause Debug Assistant",
    description: "Analyze errors and provide a shortest-path fix plan.",
    discoverPrompt:
      "I'm getting this error: [error]. Here is my code: [code]. Please explain the problem in plain English, show exactly what to change, and list the steps in order.",
    proPrompt:
      "You are a senior software engineer. Diagnose this failure from logs + code. Return: (1) probable root causes ranked by confidence, (2) minimal reproducible case, (3) patch diff-style fix, (4) regression test plan, (5) risk notes. Input logs: [logs]. Code: [code].",
    discoverHelp: "Best when you want an explanation plus exact next steps.",
    proNotes: "Ranked hypotheses and regression plan reduce re-break risk.",
  },
  {
    id: "coding-refactor-plan",
    category: "Coding",
    title: "Safe Refactor Plan",
    description: "Generate a staged refactor with guardrails and tests.",
    discoverPrompt:
      "I want to clean up this code without breaking anything: [code]. Give me a simple step-by-step refactor plan and include tests I should run after each step.",
    proPrompt:
      "Design a production-safe refactor plan for [module/system]. Provide phased milestones, dependency graph impact, rollback strategy, contract test matrix, and migration checkpoints. Include expected blast radius and observability checks.",
    discoverHelp: "Ideal for improving messy code gradually.",
    proNotes: "Phased milestones + rollback checkpoints are critical for large codebases.",
  },
  {
    id: "learning-plain-english-teacher",
    category: "Learning",
    title: "Teach Me This Simply",
    description: "Break down a complex topic with analogies and short lessons.",
    discoverPrompt:
      "Teach me [topic] like I'm a beginner. Use simple examples, a quick analogy, and a mini quiz at the end so I can check if I understood.",
    proPrompt:
      "Create a compact technical learning sprint for [topic] targeting [experience-level]. Include concept map, prerequisite checklist, 30/60/90-minute progression, benchmark exercises, and failure modes. End with self-assessment rubric.",
    discoverHelp: "Perfect for fast understanding without jargon overload.",
    proNotes: "Structured learning sprint helps professionals build real competency quickly.",
  },
  {
    id: "learning-study-plan",
    category: "Learning",
    title: "30-Day Study Plan",
    description: "Build a realistic plan with daily objectives and checkpoints.",
    discoverPrompt:
      "Build me a 30-day study plan for [goal]. I have [time/day] each day. Keep each day simple with one main task and one small practice task.",
    proPrompt:
      "Generate a 30-day mastery plan for [domain], constrained to [time budget/day]. Include daily objective, deliberate practice drill, measurable KPI, and weekly review retro template. Optimize for transfer to production tasks.",
    discoverHelp: "Helpful when you want consistency and clear daily direction.",
    proNotes: "Add KPIs so progress can be measured, not guessed.",
  },
  {
    id: "agents-workflow-designer",
    category: "Agents",
    title: "Agent Workflow Designer",
    description: "Draft a practical multi-step agent workflow for a business task.",
    discoverPrompt:
      "Help me design an AI assistant workflow for [task]. Keep it easy to follow: what the assistant does first, second, third, and when a human should review.",
    proPrompt:
      "Design an agentic workflow for [task] with tools, memory boundaries, retries, and human approval gates. Output: architecture diagram (text), state transitions, failure handling, SLA targets, and telemetry schema.",
    discoverHelp: "Use this to map automation ideas without technical complexity.",
    proNotes: "Add approval gates and telemetry from day one for production reliability.",
  },
  {
    id: "agents-system-prompt",
    category: "Agents",
    title: "System Prompt Hardening",
    description: "Create robust system prompts with constraints and refusal policy.",
    discoverPrompt:
      "Write a system prompt for an AI assistant that helps with [use case]. Keep it polite, clear, and include what the assistant should never do.",
    proPrompt:
      "Author a hardened system prompt for [assistant role]. Include instruction hierarchy, tool-use policy, output schema, refusal rubric, jailbreak resistance clauses, and escalation rules. Provide test prompts to validate compliance.",
    discoverHelp: "Great for creating safer assistants with clear behavior boundaries.",
    proNotes: "Always include validation prompts to test prompt robustness.",
  },
  {
    id: "image-brand-concepts",
    category: "Image",
    title: "Brand Visual Concepts",
    description: "Generate multiple visual concept prompts from one brand brief.",
    discoverPrompt:
      "Create 5 image prompts for a brand called [brand]. Style: [style]. Colors: [colors]. Mood: [mood]. Keep each prompt short and easy to use in Midjourney.",
    proPrompt:
      "Generate 8 production-ready image prompts from this brand brief: [brief]. For each: include subject, composition, lighting, camera/lens metadata, negative prompts, and style references. Return a matrix optimized for A/B concept testing.",
    discoverHelp: "Useful for quick creative exploration with clear style control.",
    proNotes: "Negative prompts + camera metadata improves consistency across runs.",
  },
  {
    id: "image-product-shot",
    category: "Image",
    title: "Product Shot Prompt Pack",
    description: "Create photoreal prompt variants for ecommerce assets.",
    discoverPrompt:
      "Write image prompts for a clean product photo of [product]. I need one white background version and one lifestyle version. Keep instructions beginner-friendly.",
    proPrompt:
      "Create a product-shot prompt pack for [product] with 6 variants: studio white seamless, hero angle, macro detail, contextual lifestyle, motion freeze, and premium editorial. Include lighting setup, lens, depth cues, and post-process style.",
    discoverHelp: "Good for making useful product images fast.",
    proNotes: "Variant coverage helps content teams reuse one prompt set across channels.",
  },
  {
    id: "business-meeting-brief",
    category: "Business",
    title: "Executive Meeting Brief",
    description: "Turn long notes into concise strategic briefings.",
    discoverPrompt:
      "Summarize these meeting notes so I can share them with leadership: [notes]. Keep it short with key decisions, open questions, and next steps.",
    proPrompt:
      "Convert these notes into an executive brief. Sections: Strategic Context, Decisions, Risks, Dependencies, Owners, Dates, and KPI impact. Add a confidence score and list missing information required for decision quality.",
    discoverHelp: "Perfect for faster follow-ups after messy meetings.",
    proNotes: "Confidence + missing info sections prevent false certainty.",
  },
  {
    id: "business-market-analysis",
    category: "Business",
    title: "Market Analysis Starter",
    description: "Analyze market landscape with opportunities and threats.",
    discoverPrompt:
      "Give me a simple market analysis for [industry]. Explain current trends, biggest opportunities, and biggest risks in plain language.",
    proPrompt:
      "Perform a market scan for [industry/segment]. Output TAM/SAM/SOM assumptions, competitor landscape, pricing models, moat analysis, and 3 strategic entry options with risk-adjusted scorecards.",
    discoverHelp: "Use this to understand a market quickly before planning.",
    proNotes: "Scorecards help prioritize options with explicit trade-offs.",
  },
  {
    id: "productivity-daily-planner",
    category: "Productivity",
    title: "AI Daily Planner",
    description: "Prioritize your day by impact, urgency, and available time.",
    discoverPrompt:
      "Plan my day from this task list: [tasks]. I have [hours] hours. Help me choose what to do first and what to postpone. Keep it simple.",
    proPrompt:
      "Optimize this workload for today: [tasks]. Constraints: [time blocks], [dependencies], [meeting windows]. Produce a priority schedule using impact/effort scoring, include context-switch minimization and fallback plan if two tasks slip.",
    discoverHelp: "Great for deciding what matters most each day.",
    proNotes: "Constraint-aware scheduling improves realistic execution.",
  },
  {
    id: "productivity-email-rewrite",
    category: "Productivity",
    title: "Email Rewrite Assistant",
    description: "Rewrite emails for clarity, tone, and stronger outcomes.",
    discoverPrompt:
      "Rewrite this email so it's clear and professional but friendly: [email]. Keep it short and easy to read.",
    proPrompt:
      "Rewrite this email for [audience] with objective [goal]. Return 3 versions: concise, assertive, diplomatic. Preserve facts, remove hedging, improve action clarity, and include subject line alternatives.",
    discoverHelp: "Useful when you want cleaner communication quickly.",
    proNotes: "Multi-tone options are helpful for high-stakes communication.",
  },
  {
    id: "coding-tests-generator",
    category: "Coding",
    title: "Unit Test Generator",
    description: "Generate meaningful tests including edge cases and failures.",
    discoverPrompt:
      "Write unit tests for this function: [code]. Explain what each test checks in simple language.",
    proPrompt:
      "Generate a comprehensive test suite for [function/module]. Include happy path, edge cases, property-based candidates, mutation-sensitive cases, and failure-path assertions. Return test code + rationale + coverage gaps.",
    discoverHelp: "Best for building confidence in your code changes.",
    proNotes: "Mutation-sensitive tests catch subtle regressions early.",
  },
  {
    id: "agents-evals-framework",
    category: "Agents",
    title: "Agent Evals Framework",
    description: "Create measurable eval criteria for assistant quality.",
    discoverPrompt:
      "Help me evaluate my AI assistant. Give me a beginner-friendly checklist of what good and bad responses look like.",
    proPrompt:
      "Design an eval harness for [assistant]. Include benchmark sets, scoring rubric, hallucination checks, policy compliance metrics, and release gates. Provide sample JSON schema for automated scoring.",
    discoverHelp: "Helpful for checking if your assistant is actually improving.",
    proNotes: "Release gates prevent quality regressions over time.",
  },
  {
    id: "content-seo-article",
    category: "Content",
    title: "SEO Article Blueprint",
    description: "Build an SEO-focused article outline and draft sections.",
    discoverPrompt:
      "Create an article outline about [keyword/topic] for beginners. Include H1, H2s, and short bullet points for what each section should say.",
    proPrompt:
      "Generate an SEO content brief for [primary keyword]. Include search intent mapping, SERP gap hypotheses, semantic clusters, internal linking plan, and a conversion-focused outline. Return JSON + markdown outputs.",
    discoverHelp: "Great for writing articles that are structured and useful.",
    proNotes: "Intent mapping aligns content with search behavior and conversion goals.",
  },
  {
    id: "learning-interview-prep",
    category: "Learning",
    title: "Interview Prep Simulator",
    description: "Run mock interview Q&A with feedback and improvement points.",
    discoverPrompt:
      "Act like an interviewer for [role]. Ask me one question at a time and give kind, clear feedback after each answer.",
    proPrompt:
      "Simulate a senior-level interview for [role/domain]. Ask adaptive follow-up questions, score each response on depth/clarity/correctness, and produce a final gap matrix with remediation plan.",
    discoverHelp: "Useful for building confidence before interviews.",
    proNotes: "Adaptive questioning surfaces real depth rather than memorized answers.",
  },
];

export function getPromptForDepth(item: PromptItem, proEnabled: boolean) {
  return pickDepthLabel(item.discoverPrompt, item.proPrompt, proEnabled);
}

export function getPromptSupportText(item: PromptItem, proEnabled: boolean) {
  return pickDepthLabel(item.discoverHelp, item.proNotes, proEnabled);
}
