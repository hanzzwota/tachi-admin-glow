import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("keeps dashboard pages on /dashboard and auth flows on /auth", async () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    await router.navigate({ to: "/dashboard" });
    expect(router.state.location.pathname).toBe("/dashboard");

    await router.navigate({ to: "/auth", search: { view: "register" } });
    expect(router.state.location.pathname).toBe("/auth");
    expect(router.state.location.search).toEqual({ view: "register" });
  });

  it("matches the leaderboard route directly", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/leaderboard");

    expect(matches.at(-1)?.routeId).toBe("/leaderboard");
  });

  it("redirects legacy user page URLs to the primary routes", async () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    await router.navigate({ to: "/profil" });
    expect(router.state.location.pathname).toBe("/dashboard");

    await router.navigate({ to: "/setor" });
    expect(router.state.location.pathname).toBe("/dashboard");

    await router.navigate({ to: "/register" });
    expect(router.state.location.pathname).toBe("/auth");
    expect(router.state.location.search).toEqual({ view: "register" });
  });
});
