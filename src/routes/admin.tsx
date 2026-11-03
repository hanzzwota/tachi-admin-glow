import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — tachi69gmail" },
      {
        name: "description",
        content: "Kelola setoran Gmail, penarikan, user, dan pengaturan tachi69gmail.",
      },
      { property: "og:title", content: "Admin — tachi69gmail" },
      {
        property: "og:description",
        content: "Kelola setoran Gmail, penarikan, user, dan pengaturan tachi69gmail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRouteGuard,
});

function AdminRouteGuard() {
  useEffect(() => {
    let active = true;

    fetch("/api/auth/me", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((payload) => {
        if (active && payload?.user?.role !== "admin") {
          window.history.replaceState({}, "", "/dashboard");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      })
      .catch(() => {
        if (active) {
          window.history.replaceState({}, "", "/dashboard");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return <AdminPageFrame />;
}
