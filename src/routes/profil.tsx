import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/profil")({
  component: () => <StaticPageFrame view="profil" />,
});
