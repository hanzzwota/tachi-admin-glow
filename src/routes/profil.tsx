import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";

export const Route = createFileRoute("/profil")({
  head: () => ({ meta: [{ title: "Profil — tachi69gmail" }] }),
  component: () => <StaticPageFrame view="profil" />,
});
