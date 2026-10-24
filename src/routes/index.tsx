import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    scripts: [
      {
        src: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7166254458926131",
        async: true,
        crossOrigin: "anonymous",
      },
    ],
    meta: [
      { title: "tachi69gmail — Setor Gmail, Dapat Saldo" },
      {
        name: "description",
        content:
          "Setor akun Gmail, pantau saldo, dan tarik penghasilan dengan mudah di tachi69gmail.",
      },
      { property: "og:title", content: "tachi69gmail — Setor Gmail, Dapat Saldo" },
      {
        property: "og:description",
        content: "Setor akun Gmail, pantau saldo, dan tarik penghasilan di tachi69gmail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return <iframe src="/app.html" title="tachi69gmail" className="block h-screen w-full border-0" />;
}
