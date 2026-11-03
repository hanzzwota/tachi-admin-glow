import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";

export const Route = createFileRoute("/saldo")({
  head: () => ({ meta: [{ title: "Saldo — tachi69gmail" }] }),
  component: () => <StaticPageFrame view="saldo" />,
});
