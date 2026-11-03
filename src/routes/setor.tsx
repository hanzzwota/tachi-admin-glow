import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";

export const Route = createFileRoute("/setor")({
  head: () => ({ meta: [{ title: "Setor Gmail — tachi69gmail" }] }),
  component: () => <StaticPageFrame view="setor" />,
});
