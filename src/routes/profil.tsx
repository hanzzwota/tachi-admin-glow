import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/profil")({
  head: () => ({
    meta: [
      { title: "Profil — tachi69gmail" },
      { name: "description", content: "Kelola profil dan rekening penarikan tachi69gmail Anda." },
      { property: "og:title", content: "Profil — tachi69gmail" },
      { property: "og:description", content: "Kelola profil dan rekening penarikan tachi69gmail Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaticPageFrame view="profil" />,
});
