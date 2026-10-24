import { createFileRoute } from "@tanstack/react-router";
import { AdminPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — tachi69gmail" },
      { name: "description", content: "Kelola setoran Gmail, penarikan, user, dan pengaturan tachi69gmail." },
      { property: "og:title", content: "Admin — tachi69gmail" },
      { property: "og:description", content: "Kelola setoran Gmail, penarikan, user, dan pengaturan tachi69gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPageFrame,
});
