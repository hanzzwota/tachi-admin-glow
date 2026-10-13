# User page entry points

User flows are exposed through independent extensionless routes: `/login`, `/register`, `/dashboard`, `/setor`, `/saldo`, `/profil`, and `/riwayat`. Navigation changes the top-level URL instead of keeping every view inside the dashboard, while the server-side Supabase session is shared through the HttpOnly cookie; browser storage is not the source of account or transaction data.
