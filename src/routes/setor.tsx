import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/setor")({
  head: () => ({
    meta: [
      { title: "Setor Gmail — tachi69gmail" },
      { name: "description", content: "Kirim akun Gmail untuk diverifikasi dan dapatkan saldo di tachi69gmail." },
      { property: "og:title", content: "Setor Gmail — tachi69gmail" },
      { property: "og:description", content: "Kirim akun Gmail untuk diverifikasi dan dapatkan saldo di tachi69gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaticPageFrame view="setor" />,
});
