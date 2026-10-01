import Link from "next/link";
import { Layers } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Button } from "@/components/ui/button";
import { ListaMestreConfigView } from "@/components/configuracoes/lista-mestre-config-view";
import { AbasCatalogo } from "@/components/configuracoes/catalogo/abas-catalogo";
import type { PranchaCatalogoRow } from "@/modules/projetos/pranchas/queries";

/**
 * Aba "Formatos de folha" (E11), nas duas lentes. Folha (A1, A3…) não entra no nome do arquivo nem tem
 * vocabulário por versão: sem seletor de versão, sem aviso de rascunho, sem busca — só a lista e o
 * formulário de uma sigla nova, como a Lista Mestre fazia.
 */
export function CatalogoFolhasView({
  lente,
  folhas,
  podeGerir,
}: {
  lente: number | "todas";
  folhas: PranchaCatalogoRow[];
  podeGerir: boolean;
}) {
  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Disciplinas e nomenclatura"
        descricao="Catálogo do padrão de nome de arquivo, versão por versão."
        trilha={[
          { href: "/", label: "Início" },
          { href: "/configuracoes", label: "Configurações" },
        ]}
        acoes={
          podeGerir ? (
            <Button size="sm" variant="outline" render={<Link href="/configuracoes/nomenclatura/versoes" />}>
              <Layers className="size-4" /> Versões
            </Button>
          ) : undefined
        }
      />
      <AbasCatalogo lente={lente} aba="folhas" podeGerir={podeGerir} />
      <p className="text-sm text-muted-foreground">
        Formato do papel (A1, A3…). Não depende de versão do padrão: vale igual em todas.
      </p>
      <ListaMestreConfigView catalogos={folhas} categorias={["folha"]} />
    </div>
  );
}
