// Centralized text that switches with Pro/Lay mode.
import type { Database } from "@/integrations/supabase/types";

export type Mode = Database["public"]["Enums"]["user_mode"];

type Copy = {
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  navDirectory: string;
  navChat: string;
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
  lay: {
    tagline: "Your friendly AI hub",
    heroTitle: "All the AI tools, explained simply.",
    heroSubtitle:
      "Discover, compare, and chat with the best AI tools — without the jargon. Switch to Pro mode anytime.",
    ctaPrimary: "Show me the tools",
    ctaSecondary: "Try the AI chat",
    navDirectory: "AI Tools",
    navChat: "Ask AI",
    navDashboard: "My stuff",
    navAdmin: "Admin",
    toggleHint: "Switch to expert mode",
    directoryTitle: "Pick an AI tool",
    directorySubtitle: "Big buttons, plain English. Tap a card to learn what each one does.",
    searchPlaceholder: "Search by name…",
    filterCategory: "What it does",
    filterCost: "Price",
    filterAudience: "Who it's for",
    chatTitle: "Ask the AI",
    chatSubtitle: "Type a question. We'll ask several smart AIs and show you their answers side by side.",
    chatPromptLabel: "Your question",
    chatPromptPlaceholder: "Explain quantum computing like I'm 5…",
    chatModelsLabel: "AI helpers to ask",
    chatRun: "Ask the AIs",
    chatRunning: "Thinking…",
    chatTokensLabel: "Words used",
    chatCostLabel: "Approx. cost",
    dashboardTitle: "Your space",
    dashboardEmpty: "No favorites yet. Star a tool you like and it'll show up here.",
    authTitle: "Welcome to Pihlai",
    authSubtitle: "Make an account to save favorites and chat history.",
  },
  pro: {
    tagline: "Pihlai // Pro AI workbench",
    heroTitle: "One workbench. Every frontier model.",
    heroSubtitle:
      "Curated AI tooling, multi-model parallel inference, and per-call cost analytics. Built for operators.",
    ctaPrimary: "Open directory",
    ctaSecondary: "Launch aggregator",
    navDirectory: "Directory",
    navChat: "Aggregator",
    navDashboard: "Dashboard",
    navAdmin: "Admin",
    toggleHint: "Switch to layperson view",
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
    authTitle: "Pihlai access",
    authSubtitle: "Sign in to persist sessions, favorites, and chat aggregator history.",
  },
};

export function t(mode: Mode) {
  return copy[mode];
}
