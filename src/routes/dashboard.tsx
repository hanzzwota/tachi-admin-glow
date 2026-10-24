import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — tachi69gmail" },
      { name: "description", content: "Ringkasan setoran, saldo, dan aktivitas akun tachi69gmail Anda." },
      { property: "og:title", content: "Dashboard — tachi69gmail" },
      { property: "og:description", content: "Ringkasan setoran, saldo, dan aktivitas akun tachi69gmail Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaticPageFrame view="dashboard" />,
});
