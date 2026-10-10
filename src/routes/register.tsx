import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/register")({
  component: () => <StaticPageFrame view="register" />,
});
