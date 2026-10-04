import { ArvoreDocumentos, type DisciplinaArvore, type SelecaoArvore } from "@/components/projetos/arquivos/arvore-documentos";
import type { ArvoreDaDisciplina } from "@/modules/uploads/arvore-navegacao";
import { PainelNavegacaoDocumentos } from "@/components/projetos/arquivos/painel-navegacao-documentos";
import { PainelAreasProjeto } from "@/components/projetos/arquivos/painel-areas-projeto";
import { AREAS_NA_RAIZ, rotuloArea, type AreaDisponivel, type AreaProjeto } from "@/modules/uploads/areas-projeto";
import { ConteudoAreaProjeto, type DadosAreas } from "@/components/projetos/arquivos/conteudo-area-projeto";
import { LinkPublicoArquivosButton } from "@/components/projetos/link-publico-arquivos-dialog";
import { NomenclaturaProjetoButton } from "@/components/projetos/arquivos/nomenclatura-projeto-dialog";
import { MenuArquivos } from "@/components/projetos/arquivos/menu-arquivos";
import { GerarListaMestreButton } from "@/components/projetos/arquivos/gerar-lista-mestre-dialog";
import { BotaoPastas, PainelLateralDocumentos } from "@/components/projetos/arquivos/painel-lateral-documentos";
import type { ListaPainel } from "@/components/projetos/arquivos/painel-listas";
import { TabelaDocumentos } from "@/components/projetos/arquivos/tabela-documentos";
import { FiltrosDocumentos, type OpcaoCatalogoDocumento } from "@/components/projetos/arquivos/filtros-documentos";
import { SeletorColunas } from "@/components/projetos/arquivos/seletor-colunas";
import { EnviarDocumentosDialog, type DadosEnviarDocumentos } from "@/components/projetos/arquivos/enviar-documentos-dialog";
import { SeletorFasesDocumentos, type OpcaoFaseDocumento } from "@/components/projetos/arquivos/seletor-fases-documentos";
import type { OpcaoStatusDocumento } from "@/components/projetos/arquivos/painel-documento-detalhe";
import { Pagination } from "@/components/ui/pagination";
import { QuadroAlturaTela } from "@/components/ui/quadro-altura-tela";
import { ModoFocoBotao } from "@/components/ui/modo-foco-botao";
import type { LinhaDoc } from "@/modules/uploads/documentos-agrupados";
import {
  PASTA_DESENVOLVIMENTO,
  pastaDoModeloFederado,
  pastasDaRaiz,
  pastasDoNivel,
  raizDaNavegacao,
  segmentoDaRaiz,
  trilhaDaPasta,
  type NivelPasta,
  type SituacaoDaPasta,
} from "@/modules/uploads/pastas-da-lista";
import { ROTULO_SITUACAO, type Situacao } from "@/modules/uploads/revisao-marcada";
import { TrilhaPastas } from "@/components/projetos/arquivos/pastas-na-lista";

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
/**
 * O que o diretório geral (/arquivos) põe em volta da tela de um projeto — ela é a MESMA da aba
 * Arquivos do projeto, com dois níveis por cima (ano → projeto).
 */
export type MolduraDiretorio = {
  /** Envolve a árvore do projeto (disciplinas e áreas) na árvore de ano → projeto. */
  arvore: (doProjeto: React.ReactNode) => React.ReactNode;
  /** Trechos da trilha acima do projeto ("Todos os projetos › 2026"), com endereço. */
  trilhaAcima: { rotulo: string; href: string }[];
  /** Nome do projeto na trilha, no lugar de "Todos os documentos". */
  rotuloRaiz: string;
};

/** Props do botão de link público — o shell só repassa, quem monta é a page. */
type LinkPublicoProps = {
  disciplinas: { id: string; nome: string }[];
  baseUrl: string;
  clienteEmail: string | null;
  links: React.ComponentProps<typeof LinkPublicoArquivosButton>["links"];
  fasesLink?: React.ComponentProps<typeof LinkPublicoArquivosButton>["fasesLink"];
};

export function DocumentosShell({
  moldura,
  projeto,
  disciplinas,
  linhas,
  extensoes,
  autores,
  tipos,
  papeis,
  subs,
  categoriasExtensao,
  pacotes,
  temFiltroAtivo,
  nivel,
  colunas,
  colunasOcultas,
  totalFiltrado,
  paginacao,
  totalDocumentos,
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
  situacao,
  pasta,
  situacoes,
  dadosAreas,
  linkPublico,
  nomenclatura,
  exclusoesPendentes,
}: {
  /** Só no diretório geral: a árvore de ano → projeto e o começo da trilha. */
  moldura?: MolduraDiretorio;
  projeto: { id: string; nome: string; codigo: string };
  disciplinas: DisciplinaArvore[];
  linhas: LinhaDoc[];
  extensoes: string[];
  autores: string[];
  tipos: OpcaoCatalogoDocumento[];
  papeis: OpcaoCatalogoDocumento[];
  /** Sub-disciplinas dos cards deste projeto (F5). */
  subs: { id: string; nome: string }[];
  categoriasExtensao: string[];
  /** Pacotes crus presentes no recorte (sem "B" — o filtro oferece "Backup", que é semântico). */
  pacotes: string[];
  temFiltroAtivo: boolean;
  /**
   * Nível da pasta aberta, quando a tela é navegação por pastas; `null` com busca, filtro ou
   * lista — aí a lista é resultado corrido, sem pastas (decidido na página, que monta a consulta).
   */
  nivel: NivelPasta | null;
  colunas: Set<string>;
  colunasOcultas: string[];
  /** Total que casa com os filtros (o `linhas` traz só a página atual). */
  totalFiltrado: number;
  paginacao: { page: number; pageCount: number; pageSize: number };
  totalDocumentos: number;
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
  /** Pasta do cliente aberta (`?situacao=`), ou `null`. */
  situacao: Situacao | null;
  /** `?pasta=` da URL — `desenvolvimento` abre a raiz do Desenvolvimento. */
  pasta: string | null;
  /** As pastas do cliente, com o número de documentos: na raiz geral da lista e no painel lateral. */
  situacoes: SituacaoDaPasta[];
  dadosAreas: DadosAreas;
  /** `null` quando o usuário não pode gerir o link público — o botão nem aparece. */
  linkPublico: LinkPublicoProps | null;
  nomenclatura: {
    projeto: React.ComponentProps<typeof NomenclaturaProjetoButton>["nomenclaturaProjeto"];
    global: React.ComponentProps<typeof NomenclaturaProjetoButton>["nomenclaturaGlobal"];
    siglasProjeto: React.ComponentProps<typeof NomenclaturaProjetoButton>["siglasProjeto"];
    podeEditar: boolean;
    versoes: React.ComponentProps<typeof NomenclaturaProjetoButton>["versoes"];
    versaoAtualId: string | null;
    personalizado: boolean;
  };
  exclusoesPendentes: Set<string>;
}) {
  // Pastas no topo da lista, como no Google Drive: só na navegação por pastas (com busca ou
  // filtro o resultado é de pesquisa, e a contagem da pasta, que ignora o filtro, mentiria) e só
  // na página 1 — da 2 em diante a lista já passou das pastas. A raiz geral mostra as pastas-mãe
  // (Desenvolvimento, Compartilhado, Liberado para obra) e as áreas do projeto; a Lixeira fica só
  // no painel (não é pasta de trabalho). Dentro de uma pasta-mãe, as disciplinas.
  // A trilha começa na pasta-mãe: "Todos os documentos › Desenvolvimento › Estrutural".
  const raiz = raizDaNavegacao({ situacao, pasta, disciplinaId: selecao.disciplinaId });
  const segmentoRaiz = segmentoDaRaiz(raiz);
  // A pasta "Modelo federado" mora dentro do Desenvolvimento, no nível das disciplinas (spec 2026-10-04 D4).
  const federado = areas.find((a) => a.id === "federado" && a.visivel) ?? null;
  const trilha =
    areaSelecionada === "federado"
      ? [
          segmentoDaRaiz(PASTA_DESENVOLVIMENTO)!,
          { chave: "area:federado", rotulo: rotuloArea("federado"), titulo: null, destino: pastaDoModeloFederado(0).destino },
        ]
      : areaSelecionada
        ? [{ chave: `area:${areaSelecionada}`, rotulo: rotuloArea(areaSelecionada), titulo: null, destino: { disciplinaId: null, fase: null, ext: null, area: areaSelecionada } }]
        : listaSelecionadaId === null
          ? [...(segmentoRaiz ? [segmentoRaiz] : []), ...trilhaDaPasta(selecao, disciplinas, arvore)]
          : [];
  const areasComoPasta = areas
    .filter((a) => a.visivel && a.id !== "lixeira" && AREAS_NA_RAIZ.includes(a.id))
    .map((a) => ({ id: a.id, rotulo: rotuloArea(a.id), total: a.total }));
  const pastas =
    nivel === null || paginacao.page !== 1
      ? []
      : raiz === "geral" && nivel === "raiz"
        ? pastasDaRaiz({ totalDesenvolvimento: totalDocumentos, situacoes, areas: areasComoPasta })
        : [
            ...pastasDoNivel(selecao, disciplinas, arvore).map((p) =>
              // O .zip da pasta (`/api/uploads/pasta/zip`) leva a revisão VIGENTE; aqui vale a marcada.
              situacao ? { ...p, zip: null } : p,
            ),
            // No fim, depois das disciplinas: só na raiz do Desenvolvimento.
            ...(raiz === PASTA_DESENVOLVIMENTO && nivel === "raiz" && federado ? [pastaDoModeloFederado(federado.total)] : []),
          ];

  return (
    <div className="space-y-4">

      {/* Janelas abertas pelo ⋯ da barra (Nomenclatura, Lista Mestre, Link público, modo foco):
          montadas aqui, fora do menu, para não fecharem junto com ele. */}
      <NomenclaturaProjetoButton
        semBotao
        projetoId={projeto.id}
        nomenclaturaProjeto={nomenclatura.projeto}
        nomenclaturaGlobal={nomenclatura.global}
        siglasProjeto={nomenclatura.siglasProjeto}
        podeEditar={nomenclatura.podeEditar}
        versoes={nomenclatura.versoes}
        versaoAtualId={nomenclatura.versaoAtualId}
        personalizado={nomenclatura.personalizado}
      />
      {dadosUploader && (
        <GerarListaMestreButton
          semBotao
          projetoId={projeto.id}
          disciplinas={dadosUploader.disciplinas.filter((d) => !d.usaPastas).map((d) => ({ id: d.id, nome: d.nome }))}
          podeEditarMetadados={dadosUploader.podeEditarMetadados}
          podeValidar={podeValidar}
        />
      )}
      {linkPublico && (
        <LinkPublicoArquivosButton
          semBotao
          projetoId={projeto.id}
          disciplinas={linkPublico.disciplinas}
          baseUrl={linkPublico.baseUrl}
          clienteEmail={linkPublico.clienteEmail}
          links={linkPublico.links}
          fasesLink={linkPublico.fasesLink}
        />
      )}
      <ModoFocoBotao semBotao />

      <QuadroAlturaTela folga={40} className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr] md:items-start">
        <PainelLateralDocumentos>
          <PainelNavegacaoDocumentos
            projetoId={projeto.id}
            disciplinas={disciplinas}
            arvore={arvore}
            totalGeral={totalDocumentos}
            selecao={selecao}
            raiz={raiz}
            situacoes={situacoes}
            listas={listas}
            listaSelecionadaId={listaSelecionadaId}
            podeGerirListas={podeGerirListas}
            areaAtiva={areaSelecionada !== null}
            modeloFederado={federado ? { total: federado.total, ativo: areaSelecionada === "federado" } : null}
            // No diretório, as pastas do projeto aparecem DENTRO do nó dele na árvore de anos.
            pastas={
              moldura
                ? moldura.arvore(
                    <>
                      <ArvoreDocumentos
                        aninhada
                        disciplinas={disciplinas}
                        arvore={arvore}
                        totalGeral={totalDocumentos}
                        selecao={selecao}
                        raiz={raiz}
                        situacoes={situacoes}
                        areaAtiva={areaSelecionada !== null}
                        modeloFederado={federado ? { total: federado.total, ativo: areaSelecionada === "federado" } : null}
                      />
                      <PainelAreasProjeto aninhada areas={areas} selecionada={areaSelecionada} />
                    </>,
                  )
                : undefined
            }
          />
          {!moldura && <PainelAreasProjeto areas={areas} selecionada={areaSelecionada} />}
        </PainelLateralDocumentos>

        <main className="min-w-0 space-y-3 md:flex md:h-full md:min-h-0 md:flex-col md:space-y-0 md:gap-3">
          {areaSelecionada ? (
            // Área do projeto escolhida: o conteúdo dela ocupa o lugar da tabela. Filtros e
            // paginação são de documento de disciplina e não se aplicam aqui.
            <section className="relative space-y-2 rounded-md border border-border bg-card p-3">
              <TrilhaPastas trilha={trilha} inicio={moldura?.trilhaAcima} rotuloRaiz={moldura?.rotuloRaiz} />
              {/* O nome da área já está na trilha acima e na pasta logo abaixo (com contagem e "Enviar"):
                  o título fica só para leitor de tela, senão o mesmo nome aparecia três vezes. */}
              <h3 className="sr-only">{rotuloArea(areaSelecionada)}</h3>
              <ConteudoAreaProjeto area={areaSelecionada} dados={dadosAreas} />
            </section>
          ) : (
          <>
          {/* Barra única: busca, filtros, fases e colunas na mesma linha (quebra só se faltar largura). */}
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <BotaoPastas />
            <div className="min-w-0 flex-1 basis-0 md:basis-72">
            <FiltrosDocumentos
              extensoes={extensoes}
              autores={autores}
              status={status}
              tipos={tipos}
              papeis={papeis}
              subs={subs}
              categoriasExtensao={categoriasExtensao}
              pacotes={pacotes}
              totalFiltrado={totalFiltrado}
            />
            </div>
            <div className="order-last min-w-0 flex-[1_1_100%] xl:order-none xl:flex-[0_1_auto]">
              <SeletorFasesDocumentos fases={fases} documentosPorFase={documentosPorFase} />
            </div>
            {/* Colunas, ⋯ e Enviar no fim da mesma linha (modelo aprovado, Fase 2). */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <div className="hidden md:contents">
                <SeletorColunas ocultas={colunasOcultas} />
              </div>
              <MenuArquivos
                listaMestre={dadosUploader ? dadosUploader.disciplinas.some((d) => !d.usaPastas) : null}
                linkPublico={linkPublico ? linkPublico.links.filter((l) => l.ativo).length : null}
              />
              {dadosUploader && <EnviarDocumentosDialog dados={dadosUploader} abrirAoCarregar={abrirEnvio} />}
            </div>
          </div>
          <TrilhaPastas trilha={trilha} inicio={moldura?.trilhaAcima} rotuloRaiz={moldura?.rotuloRaiz} />
          {situacao && (
            <p className="text-xs text-muted-foreground">
              O que o cliente vê na pasta {ROTULO_SITUACAO[situacao]} do link: cada documento na revisão marcada, mesmo que
              a equipe já tenha enviado outra. Para mudar, ponha o status de novo; para tirar, use o menu do documento.
            </p>
          )}
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          <TabelaDocumentos
            projetoId={projeto.id}
            linhas={linhas}
            pastas={pastas}
            nivel={nivel}
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
          </div>
          {/* Pasta só com subpastas (raiz, fase) não tem documento para paginar. */}
          {totalFiltrado > 0 && (
            <Pagination lista="documentos"
              page={paginacao.page}
              pageCount={paginacao.pageCount}
              pageSize={paginacao.pageSize}
              total={totalFiltrado}
            />
          )}
          </>
          )}
        </main>
      </QuadroAlturaTela>
    </div>
  );
}
