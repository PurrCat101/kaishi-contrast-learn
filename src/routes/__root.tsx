import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { BarChart3, BookOpen, Home, Shuffle } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card-hard max-w-md p-8 text-center">
        <h1 className="text-7xl">404</h1>
        <h2 className="mt-4 text-xl">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md border-2 bg-primary px-4 py-2 font-bold text-primary-foreground shadow-hard-sm pressable-sm">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card-hard max-w-md p-8 text-center">
        <h1 className="text-xl">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md border-2 bg-primary px-4 py-2 font-bold text-primary-foreground shadow-hard-sm pressable-sm"
          >
            Try again
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border-2 bg-card px-4 py-2 font-bold text-foreground shadow-hard-sm pressable-sm">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "Hashi" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Bree+Serif&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@500;600;700&family=Red+Hat+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
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

const nav = [
  { to: "/", label: "Today", icon: Home },
  { to: "/review", label: "Review", icon: Shuffle },
  { to: "/vocab", label: "Words", icon: BookOpen },
  { to: "/progress", label: "Progress", icon: BarChart3 },
] as const;

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <span lang="ja" className="flex size-10 items-center justify-center rounded-md border-2 border-border bg-primary font-jp-serif text-2xl font-bold text-primary-foreground shadow-hard-sm">橋</span>
          <span className="font-display text-2xl text-foreground">Hashi</span>
          <span className="hidden font-mono text-xs uppercase tracking-widest text-muted-foreground sm:inline">Kaishi 1.5k</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-10 items-center gap-2 rounded-full border-2 border-transparent px-3 py-1 font-bold text-foreground no-underline transition-colors hover:bg-muted"
              activeProps={{ className: "border-border bg-secondary shadow-hard-sm" }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-12">
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </main>
        <footer className="border-t-2 border-border py-6 text-center font-mono text-xs text-muted-foreground">
          Vocabulary from the Kaishi 1.5k deck · Built for learners who mix things up
        </footer>
      </div>
    </QueryClientProvider>
  );
}
