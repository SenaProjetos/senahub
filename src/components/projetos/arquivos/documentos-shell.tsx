import Link from "next/link";
import { ChevronRight, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PainelDisciplinas, type DisciplinaArvore } from "@/components/projetos/arquivos/painel-disciplinas";
import { TabelaDocumentos } from "@/components/projetos/arquivos/tabela-documentos";
import { FiltrosDocumentos } from "@/components/projetos/arquivos/filtros-documentos";
import { Pagination } from "@/components/ui/pagination";
import type { LinhaDocumento } from "@/modules/uploads/lista-documentos";

/**
 * Casca da nova tela de Documentos (Fase 1, F1-PR1 — ver docs/auditoria/03-plano-refatoracao.md).
 *
 * Server Component: só monta a moldura (breadcrumb real do projeto, título, contadores, CTA)
 * e o grid de 2 painéis. O conteúdo dos painéis (árvore de disciplinas, tabela de documentos)
 * chega em F1-PR2/F1-PR3 — até lá, os dois mostram skeleton (estado de carregamento real da
 * tela, não dado fake).
 *
 * Por que um breadcrumb próprio em vez de reusar `components/shell/breadcrumb.tsx`: aquele
 * componente monta os rótulos só a partir do pathname (`buildCrumbs`), e um segmento que
 * "parece id" vira sempre "Detalhe" — não tem como injetar o nome real do projeto sem alterar
 * um componente global usado por toda a aplicação, fora do escopo desta Fase 1 (ver stop
 * condition do prompt 04: não tocar arquivo fora do escopo do PR). Esta trilha local é estática
 * (sem `usePathname`), então o componente pode continuar Server Component.
 */
export function DocumentosShell({
  projeto,
  disciplinas,
  linhas,
  extensoes,
  autores,
  temFiltroAtivo,
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
  linhas: LinhaDocumento[];
  extensoes: string[];
  autores: string[];
  temFiltroAtivo: boolean;
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
      <nav aria-label="Trilha de navegação" className="min-w-0">
        <ol className="flex items-center gap-1 text-xs text-muted-foreground">
          <li>
            <Link href="/projetos" className="truncate transition-colors hover:text-foreground">
              Projetos
            </Link>
          </li>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
          <li className="min-w-0">
            <Link
              href={`/projetos/${projeto.id}`}
              className="truncate transition-colors hover:text-foreground"
            >
              {projeto.codigo} · {projeto.nome}
            </Link>
          </li>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
          <li className="min-w-0">
            <span className="truncate font-medium text-foreground" aria-current="page">
              Documentos
            </span>
          </li>
        </ol>
      </nav>

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
          <FiltrosDocumentos extensoes={extensoes} autores={autores} totalFiltrado={totalFiltrado} />
          <TabelaDocumentos
            projetoId={projeto.id}
            linhas={linhas}
            filtradaPorDisciplina={disciplinaSelecionadaId !== null}
            temFiltroAtivo={temFiltroAtivo}
            podeCoordenacao={podeCoordenacao}
            podeValidar={podeValidar}
            podeExcluir={podeExcluir}
            podeSolicitarExclusao={podeSolicitarExclusao}
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
