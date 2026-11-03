import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/saldo")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
