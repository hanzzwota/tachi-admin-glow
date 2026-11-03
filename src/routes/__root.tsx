import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { History, Home, Upload, UserRound, Wallet } from "lucide-react";

import appCss from "../styles.css?url";
import { shouldShowAppNavigation } from "../lib/app-navigation";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Halaman tidak ditemukan</h2>
        <p className="mt-2 text-sm text-muted-foreground">Rute yang Anda buka tidak tersedia.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Kembali ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Halaman gagal dimuat
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Silakan coba lagi atau kembali ke beranda.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Coba lagi
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

const navItems = [
  { to: "/dashboard", label: "Beranda", Icon: Home },
  { to: "/riwayat", label: "Riwayat", Icon: History },
  { to: "/setor", label: "Setor", Icon: Upload },
  { to: "/saldo", label: "Saldo", Icon: Wallet },
  { to: "/profil", label: "Profil", Icon: UserRound },
] as const;

function AppNavigation() {
  const { pathname } = useLocation();
  const activePath = pathname === "/" ? "/dashboard" : pathname;
  const isPrivateApp = shouldShowAppNavigation(pathname);

  if (!isPrivateApp) return null;

  return (
    <nav className="app-navigation" aria-label="Navigasi utama">
      {navItems.map((item) => {
        const active = activePath === item.to;
        const Icon = item.Icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`app-navigation-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              className="app-navigation-icon"
              strokeWidth={active ? 2.8 : 2.2}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "tachi69gmail" },
      {
        name: "description",
        content: "Setor Gmail, pantau saldo, dan tarik penghasilan di tachi69gmail.",
      },
      { property: "og:title", content: "tachi69gmail" },
      {
        property: "og:description",
        content: "Setor Gmail, pantau saldo, dan tarik penghasilan di tachi69gmail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-root-shell">
        <main className="app-route-content">
          <Outlet />
        </main>
        <AppNavigation />
      </div>
    </QueryClientProvider>
  );
}
