import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Masuk — tachi69gmail" },
      { name: "description", content: "Masuk ke akun tachi69gmail untuk setor Gmail dan cek saldo." },
      { property: "og:title", content: "Masuk — tachi69gmail" },
      { property: "og:description", content: "Masuk ke akun tachi69gmail untuk setor Gmail dan cek saldo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaticPageFrame view="login" />,
});
