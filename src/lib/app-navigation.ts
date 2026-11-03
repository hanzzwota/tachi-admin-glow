const appNavigationPaths = new Set([
  "/",
  "/dashboard",
  "/riwayat",
  "/setor",
  "/saldo",
  "/profil",
]);

export function shouldShowAppNavigation(pathname: string): boolean {
  return appNavigationPaths.has(pathname);
}
