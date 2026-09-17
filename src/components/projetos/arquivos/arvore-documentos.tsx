"use client";

import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, Search } from "lucide-react";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { normalizar } from "@/lib/disciplinas-core";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { STATUS_LABEL, STATUS_TEXT } from "@/modules/projetos/status";
import type { ArvoreDaDisciplina, NoFase } from "@/modules/uploads/arvore-navegacao";
import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";

export type DisciplinaArvore = {
  id: string;
  nome: string;
  status: StatusDisciplina;
  total: number;
};

export type SelecaoArvore = {
  disciplinaId: string | null;
  fase: string | null;
  ext: string | null;
};

/**
 * Painel esquerdo — árvore de documentos: disciplina → fase → extensão.
 *
 * As "pastas" são os filtros que a tela já tinha (`disciplinaId`, `fase`, `ext`), não pastas do
 * banco: clicar num nó é filtrar a lista da direita, e a seleção vive na URL (mesmo padrão do
 * resto do sistema) para o servidor ler sem estado global no cliente. Nó vazio não existe — a
 * árvore é montada a partir dos documentos (`montarArvoreNavegacao`).
 */
export function ArvoreDocumentos({
  disciplinas,
  arvore,
  totalGeral,
  selecao,
  areaAtiva = false,
}: {
  disciplinas: DisciplinaArvore[];
  arvore: ArvoreDaDisciplina[];
  totalGeral: number;
  selecao: SelecaoArvore;
  /** Área do projeto aberta: "Todos os documentos" não está em exibição, então não destaca. */
  areaAtiva?: boolean;
}) {
  const [busca, setBusca] = useState("");
  // Abre sozinho o caminho da seleção (voltar no navegador, link com filtro, recarregar).
  const [abertas, setAbertas] = useState<Set<string>>(
    () => new Set([selecao.disciplinaId, selecao.disciplinaId && selecao.fase ? `${selecao.disciplinaId}/${selecao.fase}` : null].filter((c): c is string => !!c)),
  );
  const setParams = useSetParams();

  const fasesPorDisciplina = new Map(arvore.map((a) => [a.disciplinaId, a.fases]));
  const termo = normalizar(busca.trim());
  const filtradas = termo ? disciplinas.filter((d) => normalizar(d.nome).includes(termo)) : disciplinas;

  function alternar(chave: string) {
    setAbertas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  function abrirDisciplina(id: string) {
    setAbertas((atual) => new Set(atual).add(id));
    setParams({ disciplinaId: id, fase: null, ext: null, listaId: null, area: null });
  }

  function abrirFase(disciplinaId: string, fase: NoFase) {
    setAbertas((atual) => new Set(atual).add(disciplinaId).add(`${disciplinaId}/${fase.chave}`));
    setParams({ disciplinaId, fase: fase.chave, ext: null, listaId: null, area: null });
  }

  return (
    <div>
      <div className="border-b border-border px-3 py-2.5">
        <h3 className="text-sm font-semibold">Documentos</h3>
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

      <ul className="space-y-0.5 p-2" role="tree" aria-label="Documentos por disciplina, fase e formato">
        <li role="none">
          <button
            type="button"
            onClick={() => setParams({ disciplinaId: null, fase: null, ext: null, listaId: null, area: null })}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors",
              selecao.disciplinaId === null && !areaAtiva ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/60",
            )}
          >
            <span>Todos os documentos</span>
            <span className="font-normal tabular-nums text-muted-foreground">{totalGeral}</span>
          </button>
        </li>

        {filtradas.map((d) => {
          const fases = fasesPorDisciplina.get(d.id) ?? [];
          const aberta = abertas.has(d.id);
          const selecionada = selecao.disciplinaId === d.id;
          return (
            <li
              key={d.id}
              role="treeitem"
              aria-expanded={fases.length > 0 ? aberta : undefined}
              aria-selected={selecionada && !selecao.fase}
            >
              <div
                className={cn(
                  "flex items-center gap-0.5 rounded-md pr-2 transition-colors",
                  selecionada && !selecao.fase ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => alternar(d.id)}
                  className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-0"
                  disabled={fases.length === 0}
                  aria-label={aberta ? `Recolher ${d.nome}` : `Expandir ${d.nome}`}
                  title={aberta ? "Recolher" : "Expandir"}
                >
                  <ChevronRight className={cn("size-3.5 transition-transform", aberta && "rotate-90")} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => abrirDisciplina(d.id)}
                  title={STATUS_LABEL[d.status]}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-xs"
                >
                  <DisciplinaIcone nome={d.nome} className={cn("size-3.5 shrink-0", STATUS_TEXT[d.status])} />
                  <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{d.total}</span>
                </button>
              </div>

              {aberta && fases.length > 0 && (
                <ul className="mt-0.5 space-y-0.5 border-l border-border pl-2 ml-3" role="group">
                  {fases.map((fase) => {
                    const chaveFase = `${d.id}/${fase.chave}`;
                    const faseAberta = abertas.has(chaveFase);
                    const faseSelecionada = selecionada && selecao.fase === fase.chave;
                    return (
                      <li
                        key={fase.chave}
                        role="treeitem"
                        aria-expanded={faseAberta}
                        aria-selected={faseSelecionada && !selecao.ext}
                      >
                        <div
                          className={cn(
                            "flex items-center gap-0.5 rounded-md pr-2 transition-colors",
                            faseSelecionada && !selecao.ext ? "bg-accent" : "hover:bg-accent/60",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => alternar(chaveFase)}
                            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                            aria-label={faseAberta ? `Recolher ${fase.rotulo}` : `Expandir ${fase.rotulo}`}
                            title={faseAberta ? "Recolher" : "Expandir"}
                          >
                            <ChevronRight className={cn("size-3.5 transition-transform", faseAberta && "rotate-90")} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirFase(d.id, fase)}
                            title={fase.titulo}
                            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-xs"
                          >
                            {faseAberta ? (
                              <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            ) : (
                              <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1 truncate">{fase.rotulo}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{fase.total}</span>
                          </button>
                        </div>

                        {faseAberta && (
                          <ul className="mt-0.5 space-y-0.5 border-l border-border pl-2 ml-3" role="group">
                            {fase.extensoes.map((extensao) => (
                              <li
                                key={extensao.chave}
                                role="treeitem"
                                aria-selected={faseSelecionada && selecao.ext === extensao.chave}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setParams({
                                      disciplinaId: d.id,
                                      fase: fase.chave,
                                      ext: extensao.chave,
                                      listaId: null,
                                      area: null,
                                    })
                                  }
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-[1.375rem] text-left text-xs transition-colors",
                                    faseSelecionada && selecao.ext === extensao.chave
                                      ? "bg-accent text-foreground"
                                      : "text-foreground hover:bg-accent/60",
                                  )}
                                >
                                  <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase">{extensao.rotulo}</span>
                                  <span className="shrink-0 tabular-nums text-muted-foreground">{extensao.total}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}

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
