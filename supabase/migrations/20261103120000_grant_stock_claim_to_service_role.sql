-- Server-side API uses the service role for atomic stock claims; keep anonymous
-- and authenticated direct execution revoked as configured in the hardening migration.
grant execute on function public.claim_gmail_stock() to service_role;
