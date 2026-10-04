"use client";

import { useState } from "react";
import { ArvoreDocumentos, type DisciplinaArvore, type SelecaoArvore } from "@/components/projetos/arquivos/arvore-documentos";
import { PainelListas, type ListaPainel } from "@/components/projetos/arquivos/painel-listas";
import type { ArvoreDaDisciplina } from "@/modules/uploads/arvore-navegacao";
import type { RaizNavegacao, SituacaoDaPasta } from "@/modules/uploads/pastas-da-lista";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Alterna a navegação por disciplina e por coleção lógica, preservando seleção na URL. */
export function PainelNavegacaoDocumentos({
  projetoId,
  disciplinas,
  arvore,
  totalGeral,
  selecao,
  raiz,
  situacoes,
  listas,
  listaSelecionadaId,
  podeGerirListas,
  areaAtiva = false,
  pastas,
}: {
  projetoId: string;
  disciplinas: DisciplinaArvore[];
  arvore: ArvoreDaDisciplina[];
  totalGeral: number;
  selecao: SelecaoArvore;
  raiz: RaizNavegacao;
  situacoes: SituacaoDaPasta[];
  listas: ListaPainel[];
  listaSelecionadaId: string | null;
  podeGerirListas: boolean;
  areaAtiva?: boolean;
  /** Árvore pronta para a aba Pastas (o diretório geral a monta dentro da árvore de anos). */
  pastas?: React.ReactNode;
}) {
  const [aba, setAba] = useState(listaSelecionadaId ? "listas" : "disciplinas");
  return (
    <Tabs value={aba} onValueChange={(value) => setAba(value ?? "disciplinas")} className="gap-0">
      <TabsList className="mx-2 mt-2 w-auto" variant="line">
        <TabsTrigger value="disciplinas" className="text-xs">Pastas</TabsTrigger>
        <TabsTrigger value="listas" className="text-xs">Listas</TabsTrigger>
      </TabsList>
      <TabsContent value="disciplinas">
        {pastas ?? (
          <ArvoreDocumentos
            disciplinas={disciplinas}
            arvore={arvore}
            totalGeral={totalGeral}
            selecao={selecao}
            raiz={raiz}
            situacoes={situacoes}
            areaAtiva={areaAtiva}
          />
        )}
      </TabsContent>
      <TabsContent value="listas">
        <PainelListas projetoId={projetoId} listas={listas} selecionadaId={listaSelecionadaId} podeGerir={podeGerirListas} />
      </TabsContent>
    </Tabs>
  );
}
