"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { normalizar } from "@/lib/disciplinas-core";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { STATUS_LABEL, STATUS_TEXT } from "@/modules/projetos/status";
import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";

export type DisciplinaArvore = {
  id: string;
  nome: string;
  status: StatusDisciplina;
  total: number;
};

/**
 * Painel esquerdo — árvore de disciplinas (F1-PR2, docs/auditoria/03-plano-refatoracao.md).
 *
 * Só a aba "Disciplinas": a de "Listas" (item 4 da spec) precisa de tabela nova
 * (`ListaDocumentos`), então fica pra Fase 2 — ver desvio registrado no topo do plano.
 *
 * Seleção via URL (`?disciplinaId=`), não estado local — mesmo padrão de filtro do resto
 * do sistema (`useSetParams`), e deixa o painel principal (F1-PR3) ler a seleção no
 * server sem precisar de um estado global client-side compartilhado entre os dois painéis.
 */
export function PainelDisciplinas({
  disciplinas,
  totalGeral,
  selecionadaId,
}: {
  disciplinas: DisciplinaArvore[];
  totalGeral: number;
  selecionadaId: string | null;
}) {
  const [busca, setBusca] = useState("");
  const setParams = useSetParams();

  const termo = normalizar(busca.trim());
  const filtradas = termo ? disciplinas.filter((d) => normalizar(d.nome).includes(termo)) : disciplinas;

  return (
    <div>
      <div className="border-b border-border px-3 py-2.5">
        <h3 className="text-sm font-semibold">Disciplinas</h3>
      </div>

      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar disciplina"
            aria-label="Pesquisar disciplina"
            className="h-8 w-full rounded-md border border-border bg-background pr-2 pl-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <ul className="space-y-0.5 p-2" role="list">
        <li>
          <button
            type="button"
            onClick={() => setParams({ disciplinaId: null })}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors",
              selecionadaId === null ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/60",
            )}
          >
            <span>Todos os documentos</span>
            <span className="tabular-nums text-muted-foreground font-normal">{totalGeral}</span>
          </button>
        </li>

        {filtradas.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => setParams({ disciplinaId: d.id })}
              title={STATUS_LABEL[d.status]}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                selecionadaId === d.id ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/60",
              )}
            >
              <DisciplinaIcone nome={d.nome} className={cn("size-3.5 shrink-0", STATUS_TEXT[d.status])} />
              <span className="min-w-0 flex-1 truncate">{d.nome}</span>
              <span className="tabular-nums shrink-0 text-muted-foreground">{d.total}</span>
            </button>
          </li>
        ))}

        {termo && filtradas.length === 0 && (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">
            Nenhuma disciplina encontrada para &quot;{busca.trim()}&quot;.
          </li>
        )}

        {disciplinas.length === 0 && !termo && (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">
            Nenhuma disciplina visível para o seu perfil neste projeto.
          </li>
        )}
      </ul>
    </div>
  );
}
