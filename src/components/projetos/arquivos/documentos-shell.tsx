import { Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PainelDisciplinas, type DisciplinaArvore } from "@/components/projetos/arquivos/painel-disciplinas";
import { TabelaDocumentos } from "@/components/projetos/arquivos/tabela-documentos";
import { FiltrosDocumentos } from "@/components/projetos/arquivos/filtros-documentos";
import { SeletorColunas } from "@/components/projetos/arquivos/seletor-colunas";
import { Pagination } from "@/components/ui/pagination";
import type { LinhaDoc } from "@/modules/uploads/documentos-agrupados";

/**
 * Casca da nova tela de Documentos (Fase 1, F1-PR1 — ver docs/auditoria/03-plano-refatoracao.md).
 *
 * Server Component: só monta a moldura (breadcrumb real do projeto, título, contadores, CTA)
 * e o grid de 2 painéis. O conteúdo dos painéis (árvore de disciplinas, tabela de documentos)
 * chega em F1-PR2/F1-PR3 — até lá, os dois mostram skeleton (estado de carregamento real da
 * tela, não dado fake).
 *
 * Sem breadcrumb próprio: o shell já renderiza a trilha em toda página do dashboard, e o
 * cabeçalho do projeto mostra código e nome logo acima — uma segunda trilha aqui só empilhava
 * a mesma informação duas vezes (visto ao rodar a tela).
 */
export function DocumentosShell({
  projeto,
  disciplinas,
  linhas,
  extensoes,
  autores,
  temFiltroAtivo,
  colunas,
  colunasOcultas,
  totalFiltrado,
  paginacao,
  totalDocumentos,
  totalDisciplinas,
  disciplinaSelecionadaId,
  podeEnviar,
  podeCoordenacao,
  podeValidar,
  podeExcluir,
  podeSolicitarExclusao,
}: {
  projeto: { id: string; nome: string; codigo: string };
  disciplinas: DisciplinaArvore[];
  linhas: LinhaDoc[];
  extensoes: string[];
  autores: string[];
  temFiltroAtivo: boolean;
  colunas: Set<string>;
  colunasOcultas: string[];
  /** Total que casa com os filtros (o `linhas` traz só a página atual). */
  totalFiltrado: number;
  paginacao: { page: number; pageCount: number; pageSize: number };
  totalDocumentos: number;
  totalDisciplinas: number;
  disciplinaSelecionadaId: string | null;
  podeEnviar: boolean;
  podeCoordenacao: boolean;
  podeValidar: boolean;
  podeExcluir: boolean;
  podeSolicitarExclusao: boolean;
}) {
  return (
    <div className="space-y-4">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Documentos</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {totalDocumentos} {totalDocumentos === 1 ? "documento" : "documentos"} · {totalDisciplinas}{" "}
            {totalDisciplinas === 1 ? "disciplina" : "disciplinas"}
          </p>
        </div>
        {podeEnviar && (
          <Button size="sm">
            <UploadIcon className="size-3.5" /> Enviar documentos
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr] md:items-start">
        <aside className="rounded-md border border-border bg-card md:sticky md:top-20">
          <PainelDisciplinas
            disciplinas={disciplinas}
            totalGeral={totalDocumentos}
            selecionadaId={disciplinaSelecionadaId}
          />
        </aside>

        <main className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <FiltrosDocumentos extensoes={extensoes} autores={autores} totalFiltrado={totalFiltrado} />
            <SeletorColunas ocultas={colunasOcultas} />
          </div>
          <TabelaDocumentos
            projetoId={projeto.id}
            linhas={linhas}
            filtradaPorDisciplina={disciplinaSelecionadaId !== null}
            temFiltroAtivo={temFiltroAtivo}
            podeCoordenacao={podeCoordenacao}
            podeValidar={podeValidar}
            podeExcluir={podeExcluir}
            podeSolicitarExclusao={podeSolicitarExclusao}
            colunas={colunas}
          />
          <Pagination
            page={paginacao.page}
            pageCount={paginacao.pageCount}
            pageSize={paginacao.pageSize}
            total={totalFiltrado}
          />
        </main>
      </div>
    </div>
  );
}
