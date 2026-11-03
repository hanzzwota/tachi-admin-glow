import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/profil")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
