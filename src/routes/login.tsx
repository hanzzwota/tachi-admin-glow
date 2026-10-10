import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/login")({
  component: () => <StaticPageFrame view="login" />,
});
