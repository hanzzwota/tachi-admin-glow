import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === "register" ? "register" : "login",
  }),
  component: AuthPage,
});

function AuthPage() {
  const { view } = Route.useSearch();
  return <StaticPageFrame view={view} />;
}
