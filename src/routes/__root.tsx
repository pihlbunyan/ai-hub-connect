import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PiHLAI — One-stop AI hub" },
      { name: "description", content: "Discover AI tools, chat with multiple models in parallel, and switch between Pro and Discover modes." },
      { name: "author", content: "PiHLAI" },
      { property: "og:title", content: "PiHLAI — One-stop AI hub" },
      { property: "og:description", content: "AI tool directory and multi-model chat aggregator." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { AppProvider } from "@/contexts/AppContext";
import { NavBar } from "@/components/NavBar";
import { Toaster } from "@/components/ui/sonner";
import { SiteHostWidget } from "@/components/SiteHostWidget";
import { BrandName } from "@/components/BrandName";

function RootComponent() {
  return (
    <AppProvider>
      <div className="flex min-h-screen flex-col">
        <NavBar />
        <main className="flex-1">
          <Outlet />
        </main>
        <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
          <BrandName /> · Built for serious AI work
        </footer>
      </div>
      <SiteHostWidget />
      <Toaster richColors position="top-right" />
    </AppProvider>
  );
}
