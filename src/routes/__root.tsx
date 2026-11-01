import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, BookMarked, BookOpen, Home, LogIn, LogOut, Settings2, Shuffle, Menu, X } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui-kit";
import { cn } from "../lib/utils";

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
  { to: "/my-words", label: "My Words", icon: BookMarked },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

function Header() {
  const { session, loading, configured, signInWithGoogle, signOut } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [clicked, setClicked] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => setClicked(null), [pathname]);
  useEffect(() => setMobileMenuOpen(false), [pathname]);
  const activePath = clicked ?? pathname;
  // supabase-js reports OAuth failures (e.g. provider disabled) in the result instead of throwing.
  const handleSignIn = async () => {
    setAuthError(null);
    const { error } = await signInWithGoogle();
    if (error) setAuthError(error.message);
  };
  const handleSignOut = async () => {
    setAuthError(null);
    const { error } = await signOut();
    if (error) setAuthError(error.message);
  };

  return (
    <>
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 sm:gap-3 no-underline">
            <span lang="ja" className="flex size-8 sm:size-10 items-center justify-center rounded-md border-2 border-border bg-primary font-jp-serif text-lg sm:text-2xl font-bold text-primary-foreground shadow-hard-sm">橋</span>
            <span className="font-display text-lg sm:text-2xl text-foreground">Hashi</span>
            <span className="hidden font-mono text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground xl:inline">Kaishi 1.5k</span>
          </Link>
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <nav className="hidden sm:flex min-w-0 items-center gap-1 overflow-hidden -my-1 py-1 pr-1" aria-label="Main">
              {nav.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setClicked(to)}
                  aria-current={activePath === to ? "page" : undefined}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "flex min-h-10 sm:min-h-11 items-center gap-1 sm:gap-2 rounded-full border-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 font-bold text-sm md:text-base text-foreground no-underline transition-colors whitespace-nowrap",
                    activePath === to ? "border-border bg-secondary shadow-hard-sm" : "border-transparent hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="hidden lg:inline">{label}</span>
                </Link>
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-2">
              {configured && loading && <div className="size-10" aria-hidden="true" />}
              {configured && !loading && (
                <>
                  {session ? (
                    <div className="flex items-center gap-2">
                      <div className="hidden sm:flex items-center gap-2 rounded-full border-2 border-border bg-muted px-1.5 xl:px-3 py-1">
                        <div className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                          {session.user.email?.[0]?.toUpperCase() || "U"}
                        </div>
                        <span className="hidden xl:inline font-mono text-xs text-muted-foreground max-w-[100px] truncate">
                          {session.user.email?.split("@")[0]}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={() => void handleSignOut()}>
                        <LogOut className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="surface" size="icon" aria-label="Sign in with Google" title="Sign in with Google" onClick={() => void handleSignIn()}>
                      <LogIn className="size-4" />
                    </Button>
                  )}
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle menu"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="sm:hidden"
              >
                {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>
      {authError && (
        <p role="alert" className="border-b-2 border-border bg-destructive px-4 py-2 font-mono text-xs text-destructive-foreground">
          Auth error: {authError}
        </p>
      )}
      {mobileMenuOpen && (
        <nav className="sm:hidden border-b-2 border-border bg-background px-3 py-2 flex flex-col gap-1" aria-label="Mobile">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => {
                setClicked(to);
                setMobileMenuOpen(false);
              }}
              aria-current={activePath === to ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-full border-2 px-3 py-2 font-bold text-foreground no-underline transition-colors",
                activePath === to ? "border-border bg-secondary shadow-hard-sm" : "border-transparent hover:bg-muted",
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          ))}
          <div className="border-t-2 border-border mt-2 pt-2">
            {configured && !loading && (
              <>
                {session ? (
                  <button
                    onClick={() => {
                      void handleSignOut();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 rounded-full border-2 border-transparent px-3 py-2 font-bold text-foreground hover:bg-muted transition-colors"
                  >
                    <LogOut className="size-5" />
                    <span>Sign out ({session.user.email?.split("@")[0]})</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      void handleSignIn();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 rounded-full border-2 border-border bg-primary px-3 py-2 font-bold text-primary-foreground hover:shadow-hard-sm transition-all"
                  >
                    <LogIn className="size-5" />
                    <span>Sign in with Google</span>
                  </button>
                )}
              </>
            )}
          </div>
        </nav>
      )}
    </>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const seenUser = useRef<string | null | undefined>(undefined);
  // Vocabulary fetched under a previous identity (signed out, or an expired token) may have failed or come back partial.
  useEffect(() => {
    if (loading) return;
    const changed = seenUser.current !== undefined && seenUser.current !== userId;
    seenUser.current = userId;
    if (changed) void queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("vocabulary") });
  }, [queryClient, userId, loading]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col overflow-x-hidden">
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
