import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/riwayat")({
  head: () => ({
    meta: [
      { title: "Riwayat — tachi69gmail" },
      { name: "description", content: "Riwayat setoran Gmail dan penarikan saldo di tachi69gmail." },
      { property: "og:title", content: "Riwayat — tachi69gmail" },
      { property: "og:description", content: "Riwayat setoran Gmail dan penarikan saldo di tachi69gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaticPageFrame view="riwayat" />,
});
