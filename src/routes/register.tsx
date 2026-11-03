import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Daftar — tachi69gmail" },
      { name: "description", content: "Buat akun tachi69gmail baru dan mulai setor Gmail." },
      { property: "og:title", content: "Daftar — tachi69gmail" },
      { property: "og:description", content: "Buat akun tachi69gmail baru dan mulai setor Gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaticPageFrame view="register" />,
});
