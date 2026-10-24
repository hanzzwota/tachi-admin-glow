import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/saldo")({
  head: () => ({
    meta: [
      { title: "Saldo — tachi69gmail" },
      { name: "description", content: "Lihat saldo dan ajukan penarikan di tachi69gmail." },
      { property: "og:title", content: "Saldo — tachi69gmail" },
      { property: "og:description", content: "Lihat saldo dan ajukan penarikan di tachi69gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaticPageFrame view="saldo" />,
});
