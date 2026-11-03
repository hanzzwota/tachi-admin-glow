import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";

export const Route = createFileRoute("/riwayat")({
  head: () => ({ meta: [{ title: "Riwayat — tachi69gmail" }] }),
  component: () => <StaticPageFrame view="riwayat" />,
});
