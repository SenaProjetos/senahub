import { type DisciplinaArvore } from "@/components/projetos/arquivos/painel-disciplinas";
import { PainelNavegacaoDocumentos } from "@/components/projetos/arquivos/painel-navegacao-documentos";
import { PainelAreasProjeto, rotuloArea, type AreaDisponivel, type AreaProjeto } from "@/components/projetos/arquivos/painel-areas-projeto";
import { ConteudoAreaProjeto, type DadosAreas } from "@/components/projetos/arquivos/conteudo-area-projeto";
import { LinkPublicoArquivosButton } from "@/components/projetos/link-publico-arquivos-dialog";
import type { ListaPainel } from "@/components/projetos/arquivos/painel-listas";
import { TabelaDocumentos } from "@/components/projetos/arquivos/tabela-documentos";
import { FiltrosDocumentos } from "@/components/projetos/arquivos/filtros-documentos";
import { SeletorColunas } from "@/components/projetos/arquivos/seletor-colunas";
import { EnviarDocumentosDialog, type DadosEnviarDocumentos } from "@/components/projetos/arquivos/enviar-documentos-dialog";
import { SeletorFasesDocumentos, type OpcaoFaseDocumento } from "@/components/projetos/arquivos/seletor-fases-documentos";
import type { OpcaoStatusDocumento } from "@/components/projetos/arquivos/painel-documento-detalhe";
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
/** Props do botão de link público — o shell só repassa, quem monta é a page. */
type LinkPublicoProps = {
  disciplinas: { id: string; nome: string }[];
  baseUrl: string;
  clienteEmail: string | null;
  link: React.ComponentProps<typeof LinkPublicoArquivosButton>["link"];
};

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
  listas,
  listaSelecionadaId,
  podeGerirListas,
  dadosUploader,
  fases,
  status,
  podeCoordenacao,
  podeValidar,
  podeExcluir,
  podeSolicitarExclusao,
  areas,
  areaSelecionada,
  dadosAreas,
  linkPublico,
  exclusoesPendentes,
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
  listas: ListaPainel[];
  listaSelecionadaId: string | null;
  podeGerirListas: boolean;
  dadosUploader: DadosEnviarDocumentos | null;
  fases: OpcaoFaseDocumento[];
  status: OpcaoStatusDocumento[];
  podeCoordenacao: boolean;
  podeValidar: boolean;
  podeExcluir: boolean;
  podeSolicitarExclusao: boolean;
  areas: AreaDisponivel[];
  areaSelecionada: AreaProjeto | null;
  dadosAreas: DadosAreas;
  /** `null` quando o usuário não pode gerir o link público — o botão nem aparece. */
  linkPublico: LinkPublicoProps | null;
  exclusoesPendentes: Set<string>;
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
        <div className="flex flex-wrap items-center gap-2">
          {linkPublico && (
            <LinkPublicoArquivosButton
              projetoId={projeto.id}
              disciplinas={linkPublico.disciplinas}
              baseUrl={linkPublico.baseUrl}
              clienteEmail={linkPublico.clienteEmail}
              link={linkPublico.link}
            />
          )}
          {dadosUploader && <EnviarDocumentosDialog dados={dadosUploader} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr] md:items-start">
        <aside className="rounded-md border border-border bg-card md:sticky md:top-20">
          <PainelNavegacaoDocumentos
            projetoId={projeto.id}
            disciplinas={disciplinas}
            totalGeral={totalDocumentos}
            disciplinaSelecionadaId={disciplinaSelecionadaId}
            listas={listas}
            listaSelecionadaId={listaSelecionadaId}
            podeGerirListas={podeGerirListas}
          />
          <PainelAreasProjeto areas={areas} selecionada={areaSelecionada} />
        </aside>

        <main className="min-w-0 space-y-3">
          {areaSelecionada ? (
            // Área do projeto escolhida: o conteúdo dela ocupa o lugar da tabela. Filtros e
            // paginação são de documento de disciplina e não se aplicam aqui.
            <section className="rounded-md border border-border bg-card p-3">
              <h3 className="mb-2 text-sm font-semibold">{rotuloArea(areaSelecionada)}</h3>
              <ConteudoAreaProjeto area={areaSelecionada} dados={dadosAreas} />
            </section>
          ) : (
          <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <FiltrosDocumentos extensoes={extensoes} autores={autores} status={status} totalFiltrado={totalFiltrado} />
            <SeletorColunas ocultas={colunasOcultas} />
          </div>
          <SeletorFasesDocumentos fases={fases} />
          <TabelaDocumentos
            projetoId={projeto.id}
            linhas={linhas}
            filtradaPorDisciplina={disciplinaSelecionadaId !== null}
            filtradaPorLista={listaSelecionadaId !== null}
            temFiltroAtivo={temFiltroAtivo}
            podeCoordenacao={podeCoordenacao}
            podeValidar={podeValidar}
            podeExcluir={podeExcluir}
            podeSolicitarExclusao={podeSolicitarExclusao}
            podeGerirListas={podeGerirListas}
            listas={listas}
            listaSelecionadaId={listaSelecionadaId}
            fases={fases}
            status={status}
            colunas={colunas}
            exclusoesPendentes={exclusoesPendentes}
          />
          <Pagination
            page={paginacao.page}
            pageCount={paginacao.pageCount}
            pageSize={paginacao.pageSize}
            total={totalFiltrado}
          />
          </>
          )}
        </main>
      </div>
    </div>
  );
}
