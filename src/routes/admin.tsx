import { createFileRoute } from "@tanstack/react-router";
import { AdminPageFrame } from "../components/StaticPageFrame";
export const Route = createFileRoute("/admin")({ component: AdminPageFrame });
