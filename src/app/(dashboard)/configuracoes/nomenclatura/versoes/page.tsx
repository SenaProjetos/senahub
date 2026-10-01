import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarVersoesAdmin } from "@/modules/projetos/nomenclatura/versoes-queries";
import { NomenclaturaVersoesView } from "@/components/configuracoes/nomenclatura-versoes-view";

export const metadata: Metadata = { title: "Versões da nomenclatura" };

export default async function NomenclaturaVersoesPage() {
  await requirePermission("configuracoes", "gerir");
  const versoes = await listarVersoesAdmin();

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Versões da nomenclatura"
        descricao="Versão publicada é imutável — corrigir é publicar uma nova. Projeto novo recebe a vigente."
        trilha={[
          { href: "/", label: "Início" },
          { href: "/configuracoes", label: "Configurações" },
          { href: "/configuracoes/nomenclatura", label: "Disciplinas e nomenclatura" },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        Projeto novo recebe a versão vigente na data em que é criado; publicar não muda projeto nenhum já existente.
      </p>
      <NomenclaturaVersoesView versoes={versoes} />
    </div>
  );
}
