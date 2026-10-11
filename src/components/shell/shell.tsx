import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { CommandPalette } from "@/components/shell/command-palette";
import { TarjaAssinaturaHolerite } from "@/components/rh/tarja-assinatura-holerite";
import type { ContextoNav } from "@/lib/nav-config";
import type { SessionUser } from "@/lib/session";

export function Shell({
  nav,
  user,
  title,
  faixa,
  pendenciaHolerite,
  children,
}: {
  nav: ContextoNav;
  user: Pick<SessionUser, "name" | "email" | "contratacao" | "image">;
  title?: string;
  /** Faixa acima da barra superior (ex.: "Atualize seus dados"). Rola junto com a página. */
  faixa?: React.ReactNode;
  /** Holerites aguardando assinatura do usuário (tarja no topo; não bloqueia o uso). */
  pendenciaHolerite?: { total: number; revisados: number };
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh">
      <Sidebar nav={nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        {faixa}
        {pendenciaHolerite && pendenciaHolerite.total > 0 && (
          <TarjaAssinaturaHolerite {...pendenciaHolerite} />
        )}
        <Header title={title} user={user} nav={nav} />
        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>
      <BottomNav nav={nav} />
      <CommandPalette />
    </div>
  );
}
