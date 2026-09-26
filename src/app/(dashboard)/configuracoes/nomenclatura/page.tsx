import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarVersoesAdmin } from "@/modules/projetos/nomenclatura/versoes-queries";
import { NomenclaturaVersoesView } from "@/components/configuracoes/nomenclatura-versoes-view";

export const metadata: Metadata = { title: "Nomenclatura" };

export default async function NomenclaturaConfigPage() {
  await requirePermission("configuracoes", "gerir");
  const versoes = await listarVersoesAdmin();

  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Nomenclatura" descricao="Versões do padrão de nome de arquivo. Versão publicada é imutável — corrigir é publicar uma nova. Projeto novo recebe a versão vigente na data em que é criado; publicar não muda projeto nenhum já existente." />
      <NomenclaturaVersoesView versoes={versoes} />
    </div>
  );
}
