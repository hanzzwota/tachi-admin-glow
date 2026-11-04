import { createFileRoute } from "@tanstack/react-router";
import { databaseHealth, json } from "../../server/supabase";

// app_settings columns added by later migrations; reported when missing. Response holds no secrets.
const HEALTH_COLUMNS = [
  "store_closed_reason",
  "information_cards",
  "pw_rate",
  "captcha_rate",
  "pw_enabled",
  "captcha_enabled",
  "payment_mode",
  "support_channels",
  "rules_text",
  "payment_fees",
];

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => json(await databaseHealth(HEALTH_COLUMNS)),
    },
  },
});
