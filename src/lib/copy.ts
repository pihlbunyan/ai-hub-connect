/** UI copy — one professional tone; Pro toggle unlocks depth, not a separate voice. */

export type Copy = {
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  heroBadge: string;
  heroBadgePro: string;
  ctaPrimary: string;
  ctaSecondary: string;
  navDirectory: string;
  navChat: string;
  navNews: string;
  navTopics: string;
  navPrompts: string;
  navDashboard: string;
  navAdmin: string;
  proToggleLabel: string;
  proToggleHint: string;
  directoryTitle: string;
  directorySubtitle: string;
  searchPlaceholder: string;
  newsSearchPlaceholder: string;
  topicsSubtitle: string;
  topicsSubtitlePro: string;
  topicsSearchPlaceholder: string;
  topicsSearchPlaceholderPro: string;
  promptsTitle: string;
  promptsTitlePro: string;
  promptsSubtitle: string;
  promptsSubtitlePro: string;
  promptsSearchPlaceholder: string;
  promptsSearchPlaceholderPro: string;
  filterCategory: string;
  filterCost: string;
  filterAudience: string;
  filterSafety: string;
  filterMinRating: string;
  chatTitle: string;
  chatSubtitle: string;
  chatSubtitlePro: string;
  chatPromptLabel: string;
  chatPromptPlaceholder: string;
  chatModelsLabel: string;
  chatRun: string;
  chatRunning: string;
  chatTokensLabel: string;
  chatCostLabel: string;
  dashboardTitle: string;
  dashboardSubtitle: string;
  dashboardSubtitlePro: string;
  dashboardEmpty: string;
  dashboardEmptyPro: string;
  dashboardFavHint: string;
  dashboardFavHintPro: string;
  dashboardRecsHint: string;
  dashboardRecsHintPro: string;
  authTitle: string;
  authTitlePro: string;
  authSubtitle: string;
  toolDetailAskGrok: string;
  toolDetailAnalyzeGrok: string;
  toolDetailProSectionsHint: string;
  homeFeatureDirectory: string;
  homeFeatureDirectoryPro: string;
  homeFeatureChat: string;
  homeFeatureChatPro: string;
  homeFeatureChatBody: string;
  homeFeatureChatBodyPro: string;
  newsSubtitle: string;
  newsSubtitlePro: string;
};

export const copy: Copy = {
  tagline: "AI tools, clearly organized",
  heroTitle: "Understand AI. Make it work for you.",
  heroSubtitle:
    "Browse a curated directory, compare tools, and chat with AI — practical guidance without the hype.",
  heroBadge: "PiHLAI",
  heroBadgePro: "Pro depth enabled",
  ctaPrimary: "Browse tools",
  ctaSecondary: "Ask AI",
  navDirectory: "AI Tools",
  navChat: "Ask AI",
  navNews: "News",
  navTopics: "Topics",
  navPrompts: "Prompts",
  navDashboard: "My tools",
  navAdmin: "Admin",
  proToggleLabel: "Pro Mode",
  proToggleHint: "Richer tool analysis, advanced filters, and chat metrics",
  directoryTitle: "AI tool directory",
  directorySubtitle: "Search and filter tools by category, cost, and fit.",
  searchPlaceholder: "Search tools, vendors, or capabilities…",
  newsSearchPlaceholder: "Search news by title, summary, or source…",
  topicsSubtitle:
    "Trending AI topics explained clearly so you can learn fast and take action.",
  topicsSubtitlePro:
    "Trending topics with implementation context, tooling notes, and strategy lens.",
  topicsSearchPlaceholder: "Search topics by goal or keyword…",
  topicsSearchPlaceholderPro: "Search topics, workflows, tools, or tutorials…",
  promptsTitle: "Example prompts",
  promptsTitlePro: "Prompt repository",
  promptsSubtitle:
    "Search friendly prompts you can copy instantly or run in chat with one click.",
  promptsSubtitlePro:
    "Production-ready prompts for Grok workflows, with system structure and optimization notes.",
  promptsSearchPlaceholder: "Search prompts by goal or category…",
  promptsSearchPlaceholderPro: "Search prompts, systems, optimization notes…",
  filterCategory: "Category",
  filterCost: "Cost",
  filterAudience: "Audience",
  filterSafety: "Min. safety score",
  filterMinRating: "Min. rating",
  chatTitle: "Ask AI",
  chatSubtitle: "Send a prompt and get a clear answer from Grok.",
  chatSubtitlePro: "Track tokens and estimated cost on each run.",
  chatPromptLabel: "Your question",
  chatPromptPlaceholder: "What do you want to accomplish?",
  chatModelsLabel: "Model",
  chatRun: "Send",
  chatRunning: "Working…",
  chatTokensLabel: "Tokens",
  chatCostLabel: "Est. cost",
  dashboardTitle: "Your workspace",
  dashboardSubtitle: "Your home base for saved tools and recent AI activity.",
  dashboardSubtitlePro: "Saved tools, recent chats, and workflow-focused recommendations.",
  dashboardEmpty: "You haven't saved any tools yet.",
  dashboardEmptyPro: "You have not saved any tools yet.",
  dashboardFavHint: "Save tools you like and they'll show up here for quick access.",
  dashboardFavHintPro: "Pin tools from the directory to build a quick-access working set.",
  dashboardRecsHint: "Based on your saved interests, chosen for clear practical value.",
  dashboardRecsHintPro: "Based on saved categories, prioritized for advanced workflows.",
  authTitle: "Welcome",
  authTitlePro: "Account access",
  authSubtitle: "Save favorites and keep your chat history.",
  toolDetailAskGrok: "Ask Grok",
  toolDetailAnalyzeGrok: "Analyze with Grok",
  toolDetailProSectionsHint:
    "Enable Pro Mode in the nav for extended analysis — strengths, weaknesses, pricing, and best-for guidance.",
  homeFeatureDirectory: "Curated tool directory",
  homeFeatureDirectoryPro: "Curated directory + Pro filters",
  homeFeatureChat: "Direct AI chat",
  homeFeatureChatPro: "AI chat + usage metrics",
  homeFeatureChatBody: "Ask a prompt and get a clear response from Grok.",
  homeFeatureChatBodyPro: "Run prompts with token and cost tracking on each response.",
  newsSubtitle:
    "Stay current with AI news and official updates from the teams building the tools.",
  newsSubtitlePro:
    "Curated stories and verified announcements from leading AI companies.",
};

/** Same tone — standard line by default, richer Pro line when enabled. */
export function depthCopy(standard: string, pro: string, proEnabled: boolean): string {
  return proEnabled ? pro : standard;
}
