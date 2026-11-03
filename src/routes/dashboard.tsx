import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";

const DASHBOARD_VIEWS = ["dashboard", "stor", "saldo", "profil", "riwayat"] as const;
type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export const Route = createFileRoute("/dashboard")({
  // Opsional: /dashboard?view=riwayat membuka tab Riwayat tanpa pindah URL ke route lain.
  validateSearch: (search: Record<string, unknown>): { view?: DashboardView } => {
    const view = DASHBOARD_VIEWS.find((item) => item === search.view);
    return view && view !== "dashboard" ? { view } : {};
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { view } = Route.useSearch();
  return <StaticPageFrame view={view ?? "dashboard"} />;
}
