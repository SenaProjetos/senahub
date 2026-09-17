"use client";

import { useSearchParams } from "next/navigation";
import { FASE_SEM } from "@/modules/uploads/arvore-navegacao";
import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";

export type OpcaoFaseDocumento = { id: string; sigla: string; nome: string };

/** Filtro de fase em uma linha: o id vive na URL para o servidor recortar a página. */
export function SeletorFasesDocumentos({
  fases,
  documentosPorFase,
}: {
  fases: OpcaoFaseDocumento[];
  documentosPorFase: Record<string, number>;
}) {
  const sp = useSearchParams();
  const setParams = useSetParams();
  const faseId = sp.get("fase");

  if (fases.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex w-max items-center gap-1" role="group" aria-label="Filtrar documentos por fase">
        <button
          type="button"
          onClick={() => setParams({ fase: null })}
          aria-pressed={!faseId}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            !faseId ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          Todas
        </button>
        {/* "Sem fase" só aparece quando está selecionado (a árvore é quem leva até ele) — sem
            isto, clicar na pasta "Sem fase" deixaria o filtro ativo sem nenhum jeito visível
            de sair dele, já que nenhum botão ficaria marcado. */}
        {faseId === FASE_SEM && (
          <button
            type="button"
            onClick={() => setParams({ fase: null })}
            aria-pressed
            title="Documentos ainda sem fase definida"
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
          >
            Sem fase
          </button>
        )}
        {fases.map((fase) => {
          const selecionada = faseId === fase.id;
          const total = documentosPorFase[fase.id] ?? 0;
          // Fase sem documento fica apagada e sem clique; a selecionada nunca apaga, senão
          // um link com `?fase=` vazia deixaria o filtro ativo sem jeito aparente de sair.
          const vazia = total === 0 && !selecionada;
          return (
            <button
              key={fase.id}
              type="button"
              onClick={() => setParams({ fase: fase.id })}
              disabled={vazia}
              aria-pressed={selecionada}
              title={vazia ? `${fase.nome} — nenhum documento nesta fase` : `${fase.nome} — ${total} ${total === 1 ? "documento" : "documentos"}`}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                selecionada
                  ? "bg-primary text-primary-foreground"
                  : vazia
                    ? "cursor-not-allowed text-muted-foreground/40"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {fase.sigla}
            </button>
          );
        })}
      </div>
    </div>
  );
}
