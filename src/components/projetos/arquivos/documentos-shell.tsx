import { type DisciplinaArvore, type SelecaoArvore } from "@/components/projetos/arquivos/arvore-documentos";
import type { ArvoreDaDisciplina } from "@/modules/uploads/arvore-navegacao";
import { PainelNavegacaoDocumentos } from "@/components/projetos/arquivos/painel-navegacao-documentos";
import { PainelAreasProjeto } from "@/components/projetos/arquivos/painel-areas-projeto";
import { rotuloArea, type AreaDisponivel, type AreaProjeto } from "@/modules/uploads/areas-projeto";
import { ConteudoAreaProjeto, type DadosAreas } from "@/components/projetos/arquivos/conteudo-area-projeto";
import { LinkPublicoArquivosButton } from "@/components/projetos/link-publico-arquivos-dialog";
import { NomenclaturaProjetoButton } from "@/components/projetos/arquivos/nomenclatura-projeto-dialog";
import { GerarListaMestreButton } from "@/components/projetos/arquivos/gerar-lista-mestre-dialog";
import { PainelLateralDocumentos } from "@/components/projetos/arquivos/painel-lateral-documentos";
import type { ListaPainel } from "@/components/projetos/arquivos/painel-listas";
import { TabelaDocumentos } from "@/components/projetos/arquivos/tabela-documentos";
import { FiltrosDocumentos, type OpcaoCatalogoDocumento } from "@/components/projetos/arquivos/filtros-documentos";
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
  links: React.ComponentProps<typeof LinkPublicoArquivosButton>["links"];
};

export function DocumentosShell({
  projeto,
  disciplinas,
  linhas,
  extensoes,
  autores,
  tipos,
  papeis,
  categoriasExtensao,
  pacotes,
  temFiltroAtivo,
  colunas,
  colunasOcultas,
  totalFiltrado,
  paginacao,
  totalDocumentos,
  totalDisciplinas,
  arvore,
  selecao,
  listas,
  listaSelecionadaId,
  podeGerirListas,
  dadosUploader,
  abrirEnvio,
  fases,
  documentosPorFase,
  status,
  podeCoordenacao,
  podeValidar,
  podeExcluir,
  podeSolicitarExclusao,
  areas,
  areaSelecionada,
  dadosAreas,
  linkPublico,
  nomenclatura,
  exclusoesPendentes,
}: {
  projeto: { id: string; nome: string; codigo: string };
  disciplinas: DisciplinaArvore[];
  linhas: LinhaDoc[];
  extensoes: string[];
  autores: string[];
  tipos: OpcaoCatalogoDocumento[];
  papeis: OpcaoCatalogoDocumento[];
  categoriasExtensao: string[];
  /** Pacotes crus presentes no recorte (sem "B" — o filtro oferece "Backup", que é semântico). */
  pacotes: string[];
  temFiltroAtivo: boolean;
  colunas: Set<string>;
  colunasOcultas: string[];
  /** Total que casa com os filtros (o `linhas` traz só a página atual). */
  totalFiltrado: number;
  paginacao: { page: number; pageCount: number; pageSize: number };
  totalDocumentos: number;
  totalDisciplinas: number;
  arvore: ArvoreDaDisciplina[];
  selecao: SelecaoArvore;
  listas: ListaPainel[];
  listaSelecionadaId: string | null;
  podeGerirListas: boolean;
  dadosUploader: DadosEnviarDocumentos | null;
  /** Veio do atalho "Enviar arquivos" do card da disciplina — abre o envio direto. */
  abrirEnvio: boolean;
  fases: OpcaoFaseDocumento[];
  /** Documentos por `faseId` no escopo da tela — fase ausente do mapa é fase vazia. */
  documentosPorFase: Record<string, number>;
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
  nomenclatura: {
    projeto: React.ComponentProps<typeof NomenclaturaProjetoButton>["nomenclaturaProjeto"];
    global: React.ComponentProps<typeof NomenclaturaProjetoButton>["nomenclaturaGlobal"];
    siglasProjeto: React.ComponentProps<typeof NomenclaturaProjetoButton>["siglasProjeto"];
    podeEditar: boolean;
  };
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
          <NomenclaturaProjetoButton
            projetoId={projeto.id}
            nomenclaturaProjeto={nomenclatura.projeto}
            nomenclaturaGlobal={nomenclatura.global}
            siglasProjeto={nomenclatura.siglasProjeto}
            podeEditar={nomenclatura.podeEditar}
          />
          {dadosUploader && (
            <GerarListaMestreButton
              projetoId={projeto.id}
              disciplinas={dadosUploader.disciplinas.filter((d) => !d.usaPastas).map((d) => ({ id: d.id, nome: d.nome }))}
              podeEditarMetadados={dadosUploader.podeEditarMetadados}
            />
          )}
          {linkPublico && (
            <LinkPublicoArquivosButton
              projetoId={projeto.id}
              disciplinas={linkPublico.disciplinas}
              baseUrl={linkPublico.baseUrl}
              clienteEmail={linkPublico.clienteEmail}
              links={linkPublico.links}
            />
          )}
          {dadosUploader && <EnviarDocumentosDialog dados={dadosUploader} abrirAoCarregar={abrirEnvio} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr] md:items-start">
        <PainelLateralDocumentos>
          <PainelNavegacaoDocumentos
            projetoId={projeto.id}
            disciplinas={disciplinas}
            arvore={arvore}
            totalGeral={totalDocumentos}
            selecao={selecao}
            listas={listas}
            listaSelecionadaId={listaSelecionadaId}
            podeGerirListas={podeGerirListas}
            areaAtiva={areaSelecionada !== null}
          />
          <PainelAreasProjeto areas={areas} selecionada={areaSelecionada} />
        </PainelLateralDocumentos>

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
            <FiltrosDocumentos
              extensoes={extensoes}
              autores={autores}
              status={status}
              tipos={tipos}
              papeis={papeis}
              categoriasExtensao={categoriasExtensao}
              pacotes={pacotes}
              totalFiltrado={totalFiltrado}
            />
            <SeletorColunas ocultas={colunasOcultas} />
          </div>
          <SeletorFasesDocumentos fases={fases} documentosPorFase={documentosPorFase} />
          <TabelaDocumentos
            projetoId={projeto.id}
            linhas={linhas}
            filtradaPorDisciplina={selecao.disciplinaId !== null}
            filtradaPorLista={listaSelecionadaId !== null}
            temFiltroAtivo={temFiltroAtivo}
            podeCoordenacao={podeCoordenacao}
            podeValidar={podeValidar}
            podeExcluir={podeExcluir}
            podeSolicitarExclusao={podeSolicitarExclusao}
            podeGerirListas={podeGerirListas}
            podeGerirLink={linkPublico !== null}
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
