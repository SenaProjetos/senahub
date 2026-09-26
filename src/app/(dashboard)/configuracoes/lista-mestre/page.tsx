import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { catalogosPranchaConfig } from "@/modules/projetos/pranchas/queries";
import { nomenclaturaGlobal } from "@/modules/projetos/nomenclatura/queries";
import { listarVersoesAdmin } from "@/modules/projetos/nomenclatura/versoes-queries";
import { ListaMestreConfigView } from "@/components/configuracoes/lista-mestre-config-view";
import { NomenclaturaForm } from "@/components/projetos/nomenclatura-form";

export const metadata: Metadata = { title: "Lista Mestre" };

export default async function ListaMestreConfigPage() {
  // F4 (2026-09-02): era `requireRole("admin","supervisor","administrativo")`. O par
  // `configuracoes:gerir` só está semeado em `administrativo`, então **o Coordenador perde
  // o acesso** — redução deliberada, decidida pelo dono em 2026-09-02. Para devolver,
  // basta marcar o par no perfil Coordenador (a tela agora resolve isso sem deploy).
  await requirePermission("configuracoes", "gerir");
  const [catalogos, nomencla, versoes] = await Promise.all([
    catalogosPranchaConfig(null),
    nomenclaturaGlobal(),
    listarVersoesAdmin(),
  ]);

  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Lista Mestre" descricao="Siglas de folha, tipo e fase usadas na composição do código das folhas técnicas (globais a todos os projetos)." />
      <NomenclaturaForm
        escopo="global"
        inicial={{ exigir: nomencla.exigir, exigirFase: nomencla.exigirFase, padrao: nomencla.padrao }}
        mostrarPadrao={false}
      />
      <ListaMestreConfigView catalogos={catalogos} versoes={versoes} />
    </div>
  );
}
