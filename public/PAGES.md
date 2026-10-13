# User page entry points

User flows are exposed through extensionless entry routes: `/login`, `/register`, `/dashboard`, `/setor`, `/saldo`, `/profil`, and `/riwayat`. The in-app tab menu keeps navigation inside the current app shell, while direct entry routes remain available and the server-side Supabase session is shared through the HttpOnly cookie; browser storage is not the source of account or transaction data.
