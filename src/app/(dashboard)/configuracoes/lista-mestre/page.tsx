import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { catalogosPranchaConfig } from "@/modules/projetos/pranchas/queries";
import { nomenclaturaGlobal } from "@/modules/projetos/nomenclatura/queries";
import { ListaMestreConfigView } from "@/components/configuracoes/lista-mestre-config-view";
import { NomenclaturaForm } from "@/components/projetos/nomenclatura-form";

export const metadata: Metadata = { title: "Lista Mestre" };

export default async function ListaMestreConfigPage() {
  // F4 (2026-09-02): era `requireRole("admin","supervisor","administrativo")`. O par
  // `configuracoes:gerir` só está semeado em `administrativo`, então **o Coordenador perde
  // o acesso** — redução deliberada, decidida pelo dono em 2026-09-02. Para devolver,
  // basta marcar o par no perfil Coordenador (a tela agora resolve isso sem deploy).
  await requirePermission("configuracoes", "gerir");
  const [catalogos, nomencla] = await Promise.all([catalogosPranchaConfig(null), nomenclaturaGlobal()]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/configuracoes" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Lista Mestre</h2>
        <p className="text-sm text-muted-foreground">
          Siglas de folha, tipo e fase usadas na composição do código das folhas técnicas (globais a todos os projetos).
        </p>
      </div>
      <NomenclaturaForm escopo="global" inicial={{ exigir: nomencla.exigir, exigirFase: nomencla.exigirFase, padrao: nomencla.padrao }} />
      <ListaMestreConfigView catalogos={catalogos} />
    </div>
  );
}
