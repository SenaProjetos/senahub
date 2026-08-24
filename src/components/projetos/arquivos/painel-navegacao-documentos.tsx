"use client";

import { useState } from "react";
import { PainelDisciplinas, type DisciplinaArvore } from "@/components/projetos/arquivos/painel-disciplinas";
import { PainelListas, type ListaPainel } from "@/components/projetos/arquivos/painel-listas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Alterna a navegação por disciplina e por coleção lógica, preservando seleção na URL. */
export function PainelNavegacaoDocumentos({
  projetoId,
  disciplinas,
  totalGeral,
  disciplinaSelecionadaId,
  listas,
  listaSelecionadaId,
  podeGerirListas,
}: {
  projetoId: string;
  disciplinas: DisciplinaArvore[];
  totalGeral: number;
  disciplinaSelecionadaId: string | null;
  listas: ListaPainel[];
  listaSelecionadaId: string | null;
  podeGerirListas: boolean;
}) {
  const [aba, setAba] = useState(listaSelecionadaId ? "listas" : "disciplinas");
  return (
    <Tabs value={aba} onValueChange={(value) => setAba(value ?? "disciplinas")} className="gap-0">
      <TabsList className="mx-2 mt-2 w-auto" variant="line">
        <TabsTrigger value="disciplinas" className="text-xs">Disciplinas</TabsTrigger>
        <TabsTrigger value="listas" className="text-xs">Listas</TabsTrigger>
      </TabsList>
      <TabsContent value="disciplinas">
        <PainelDisciplinas disciplinas={disciplinas} totalGeral={totalGeral} selecionadaId={disciplinaSelecionadaId} />
      </TabsContent>
      <TabsContent value="listas">
        <PainelListas projetoId={projetoId} listas={listas} selecionadaId={listaSelecionadaId} podeGerir={podeGerirListas} />
      </TabsContent>
    </Tabs>
  );
}
