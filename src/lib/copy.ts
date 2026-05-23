// Centralized text that switches with Pro/Discover mode.
export type Mode = "pro" | "discover";

type Copy = {
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  navDirectory: string;
  navChat: string;
  navNews: string;
  navTopics: string;
  navPrompts: string;
  navDashboard: string;
  navAdmin: string;
  toggleHint: string;
  directoryTitle: string;
  directorySubtitle: string;
  searchPlaceholder: string;
  filterCategory: string;
  filterCost: string;
  filterAudience: string;
  chatTitle: string;
  chatSubtitle: string;
  chatPromptLabel: string;
  chatPromptPlaceholder: string;
  chatModelsLabel: string;
  chatRun: string;
  chatRunning: string;
  chatTokensLabel: string;
  chatCostLabel: string;
  dashboardTitle: string;
  dashboardEmpty: string;
  authTitle: string;
  authSubtitle: string;
};

export const copy: Record<Mode, Copy> = {
  discover: {
    tagline: "AI tools, clearly organized",
    heroTitle: "Discover The Power Of AI. Make It Work For You.",
    heroSubtitle:
      "Discover, compare, and use leading AI tools with clear guidance and practical context.",
    ctaPrimary: "Browse tools",
    ctaSecondary: "Open chat",
    navDirectory: "AI Tools",
    navChat: "Ask AI",
    navNews: "News",
    navTopics: "AI Topics",
    navPrompts: "Prompt Repo",
    navDashboard: "My tools",
    navAdmin: "Admin",
    toggleHint: "Switch to Pro mode",
    directoryTitle: "Find the right AI tool",
    directorySubtitle: "Practical summaries and clear categories to help you choose with confidence.",
    searchPlaceholder: "Search by name…",
    filterCategory: "Use case",
    filterCost: "Price",
    filterAudience: "Who it's for",
    chatTitle: "Chat with AI",
    chatSubtitle: "Ask a question and get a focused answer quickly.",
    chatPromptLabel: "Your question",
    chatPromptPlaceholder: "Explain quantum computing like I'm 5…",
    chatModelsLabel: "Model",
    chatRun: "Send",
    chatRunning: "Working…",
    chatTokensLabel: "Tokens used",
    chatCostLabel: "Approx. cost",
    dashboardTitle: "Your dashboard",
    dashboardEmpty: "No favorites yet. Save tools to build your shortlist.",
    authTitle: "Welcome",
    authSubtitle: "Make an account to save favorites and chat history.",
  },
  pro: {
    tagline: "Pro AI workbench",
    heroTitle: "Master AI. Accelerate Your Results.",
    heroSubtitle:
      "Curated AI tooling, multi-model parallel inference, and per-call cost analytics. Built for operators.",
    ctaPrimary: "Open directory",
    ctaSecondary: "Launch aggregator",
    navDirectory: "Directory",
    navChat: "Aggregator",
    navNews: "News",
    navTopics: "AI Topics",
    navPrompts: "Prompts",
    navDashboard: "Dashboard",
    navAdmin: "Admin",
    toggleHint: "Switch to Discover view",
    directoryTitle: "Tool directory",
    directorySubtitle: "Filterable index of frontier tools across categories, with audience and cost-tier metadata.",
    searchPlaceholder: "Query tools, vendors, capabilities…",
    filterCategory: "Category",
    filterCost: "Cost tier",
    filterAudience: "Audience",
    chatTitle: "Multi-model aggregator",
    chatSubtitle: "Fan out a single prompt to N models in parallel. Compare latency, tokens, and output quality.",
    chatPromptLabel: "Prompt",
    chatPromptPlaceholder: "Draft a system message that…",
    chatModelsLabel: "Models",
    chatRun: "Run inference",
    chatRunning: "Inferring…",
    chatTokensLabel: "Tokens",
    chatCostLabel: "Est. cost (USD)",
    dashboardTitle: "Workspace",
    dashboardEmpty: "No saved tools. Pin tools to surface them here with quick-access metadata.",
    authTitle: "Access",
    authSubtitle: "Sign in to persist sessions, favorites, and chat aggregator history.",
  },
};

export function t(mode: Mode) {
  return copy[mode];
}
