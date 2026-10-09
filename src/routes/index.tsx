import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "tachi69gmail Admin Console" },
      { name: "description", content: "Dashboard admin untuk verifikasi setoran Gmail, penarikan saldo, dan pengaturan platform tachi69gmail." },
      { property: "og:title", content: "tachi69gmail Admin Console" },
      { property: "og:description", content: "Kelola setoran Gmail, penarikan, user, dan sakelar fitur tachi69gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return <iframe src="/app.html" title="tachi69gmail" className="block h-screen w-full border-0" />;
}
