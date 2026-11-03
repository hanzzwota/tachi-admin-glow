import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/setor")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
