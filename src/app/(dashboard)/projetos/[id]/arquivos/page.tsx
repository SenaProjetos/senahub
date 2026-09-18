import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can, podeAtuarEmDisciplinaAlheia } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { arvoreArquivosProjeto } from "@/modules/projetos/arquivos/queries";
import {
  lixeiraDoProjeto,
  pedidosExclusaoPendentesDoProjeto,
  opcoesFiltroDocumentos,
} from "@/modules/uploads/queries";
import {
  CAMPOS_ORDENACAO_DOC,
  campoOrdenacaoDocValido,
  listarDocumentosAgrupados,
  opcoesMetadadosDocumento,
  contagemDocumentosPorFase,
  arvoreNavegacaoDocumentos,
} from "@/modules/uploads/documentos-agrupados";
import { parseListParams, pageCount } from "@/lib/list-params";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";
import { resolverColunasVisiveis, CHAVE_PREF_COLUNAS, idsOcultaveis } from "@/modules/uploads/colunas-documento";
import { nomenclaturaDoProjeto, nomenclaturaGlobal, resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { catalogosPrancha, catalogosPranchaConfig } from "@/modules/projetos/pranchas/queries";
import {
  carregarCatalogosNomenclatura,
  carregarExtensoesNomenclatura,
  catalogoPorDisciplinaDoProjeto,
} from "@/modules/uploads/nomenclatura/queries";
import {
  recebidosDoProjeto,
  geralDoProjeto,
  baseArquitetonicaDoProjeto,
  clienteDoProjeto,
  emailClienteDoProjeto,
} from "@/modules/documentos-cliente/queries";
import { podeGerirDocumento } from "@/modules/documentos-cliente/acesso";
import type { DocumentoExistente } from "@/components/projetos/arquivos/enviar-documentos-dialog";
import { podeVerTodasDisciplinas, podeEnviarArquivo } from "@/modules/arquivos/acesso";
import type { ArquivoExistente } from "@/modules/uploads/revisao-nova";
import { linksArquivosDoProjeto } from "@/modules/projetos/arquivos/link-publico";
import type { LinkData } from "@/components/projetos/link-publico-arquivos-dialog";
import { listarArtsDoProjeto } from "@/modules/projetos/art/queries";
import { ArquivosExplorer } from "@/components/projetos/arquivos-explorer";
import { DocumentosShell } from "@/components/projetos/arquivos/documentos-shell";
import { areaValida, type AreaDisponivel } from "@/modules/uploads/areas-projeto";
import { listarListasDocumentos, podeGerirListasDocumentos } from "@/modules/uploads/listas-queries";

export const metadata: Metadata = { title: "Arquivos" };

/** Linha do banco → formato que o gerenciador de links entende (datas em ISO). */
function paraLinkData(l: {
  id: string;
  nome: string | null;
  escopo: string;
  token: string;
  ativo: boolean;
  expiraEm: Date | null;
  disciplinaIds: string[];
  uploadIds: string[];
  agruparPorFase: boolean;
}): LinkData {
  return {
    id: l.id,
    nome: l.nome,
    escopo: l.escopo as LinkData["escopo"],
    token: l.token,
    ativo: l.ativo,
    expiraEm: l.expiraEm ? l.expiraEm.toISOString() : null,
    disciplinaIds: l.disciplinaIds,
    uploadIds: l.uploadIds,
    agruparPorFase: l.agruparPorFase,
  };
}

export default async function ArquivosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    docsv2?: string;
    disciplinaId?: string;
    /** Atalho do card da disciplina: abre o diálogo de envio já na chegada. */
    enviar?: string;
    listaId?: string;
    area?: string;
    q?: string;
    ext?: string;
    autor?: string;
    periodo?: string;
    val?: string;
    fase?: string;
    status?: string;
    tipo?: string;
    papel?: string;
    catExt?: string;
    pacote?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  // Feature flag da refatoração de Documentos (Fase 1, docs/auditoria/03-plano-refatoracao.md
  // §6): padrão desligado (tela atual continua sendo o `ArquivosExplorer` de sempre);
  // `?docsv2=1` liga a tela nova em desenvolvimento, `NEXT_PUBLIC_DOCUMENTOS_V2=1` liga por
  // ambiente quando a Fase 1 estiver completa e aprovada pra virar padrão.
  const sp = await searchParams;
  const documentosV2 = process.env.NEXT_PUBLIC_DOCUMENTOS_V2 === "1" || sp?.docsv2 === "1";

  // `ehGlobal` aqui é ESCRITA (enviar em qualquer disciplina), não escopo: é o par
  // `projetos:atuar_disciplina_alheia`. Excluir documento é outro par (`arquivos:excluir`).
  const [veTodas, podeEnviarCap, ehGlobal, podeExcluirDocumento] = await Promise.all([
    podeVerTodasDisciplinas(user),
    podeEnviarArquivo(user),
    podeAtuarEmDisciplinaAlheia(user),
    can(user, "arquivos", "excluir"),
  ]);
  const [arvore, podeVerGeral, podeGerirGeral, podeValidar, nomenclatura, recebidos, baseArquitetonica, clienteId, podeGerirRecebidos, podeGerirLink, linksPublicos, clienteEmail, catalogos] =
    await Promise.all([
      arvoreArquivosProjeto(id, user.id, ehGlobal, { veTodas, podeEnviarCap }),
      can(user, "arquivos_gerais", "ver"),
      can(user, "arquivos_gerais", "gerir"),
      can(user, "uploads", "validar"),
      resolverNomenclatura(id),
      recebidosDoProjeto(id, { incluirCompartilhadosDoGeral: true }),
      baseArquitetonicaDoProjeto(id),
      clienteDoProjeto(id),
      podeGerirDocumento(user, { projetoId: id }),
      can(user, "projetos", "gerir"),
      linksArquivosDoProjeto(id),
      emailClienteDoProjeto(id),
      catalogosPrancha(id),
    ]);
  const arts = await listarArtsDoProjeto(id);
  const baseUrl = process.env.APP_URL ?? "";
  // Pasta "Geral" (Documento origem=interno) só é carregada p/ quem tem `arquivos_gerais:ver`.
  const geral = podeVerGeral ? await geralDoProjeto(id) : [];
  // Lixeira do projeto: só admin (gate da action) — os demais recebem lista vazia.
  const ehAdmin = user.role === "admin";
  const lixeira = ehAdmin ? await lixeiraDoProjeto(id) : [];
  // Pedidos de exclusão pendentes: o admin vê todos (é quem decide); os demais só o
  // próprio pedido, pra não expor que outra pessoa quer excluir aquele arquivo.
  const exclusoesPendentes = await pedidosExclusaoPendentesDoProjeto(id, ehAdmin ? undefined : user.id);

  if (documentosV2) {
    // Badge IFC abre a aba Coordenação (viewer BIM): sem a permissão, o badge vira download.
    // `arquivos:excluir` espelha na UI o gate da action (admin OU capability concedida).
    const [podeCoordenacao, podeExcluirCap, podeEditarMetadados, podeAlterarStatus, listas, podeGerirListas] = await Promise.all([
      can(user, "coordenacao", "ver"),
      can(user, "arquivos", "excluir"),
      can(user, "arquivos", "editar_metadados"),
      can(user, "arquivos", "alterar_status"),
      listarListasDocumentos({ projetoId: id, userId: user.id, veTodas }),
      podeGerirListasDocumentos(user, id),
    ]);
    const podeExcluirArquivo = ehAdmin || podeExcluirCap;
    // Só o que o resto do bloco precisa antes da árvore de navegação existir: o total de cada
    // disciplina passou a vir DELA (ver `disciplinasArvore`, mais abaixo).
    const disciplinasDoProjeto = arvore.disciplinas.map((d) => ({
      id: d.id,
      nome: d.nome,
      status: d.status,
      podeEnviar: d.podeEnviar,
    }));
    // Motor de nomenclatura no diálogo de envio (F3): o mesmo vocabulário/catálogo que a rota
    // usa, para a sugestão na tela e a gravação no servidor não divergirem.
    const [
      catalogosNomenclatura,
      extensoesNomenclatura,
      catalogoPorDisciplina,
      nomenclaturaProjeto,
      nomenclaturaDoEscritorio,
      siglasProjeto,
      podeEditarNomenclatura,
    ] = await Promise.all([
      carregarCatalogosNomenclatura(id),
      carregarExtensoesNomenclatura(),
      catalogoPorDisciplinaDoProjeto(id),
      nomenclaturaDoProjeto(id),
      nomenclaturaGlobal(),
      catalogosPranchaConfig(id),
      can(user, "configuracoes", "gerir"),
    ]);
    const disciplinasEnviaveis = arvore.disciplinas
      .filter((d) => d.podeEnviar)
      .map((d) => ({
        id: d.id,
        nome: d.nome,
        sigla: d.sigla,
        usaPastas: d.usaPastas,
        pastas: d.pastas,
        catalogoId: catalogoPorDisciplina[d.id] ?? null,
      }));
    // Documentos vivos por disciplina — alimentam a sugestão "nova versão de" quando só o
    // sufixo de cópia do nome mudou (backup do AltoQi) ou o arquivo foi renumerado.
    // `local` (pacote ou `pasta:<id>`) viaja junto porque a nova versão tem de cair no MESMO
    // destino do documento: a rota recusa o cruzamento, e o diálogo não deve nem oferecer.
    const documentosPorDisciplina: Record<string, DocumentoExistente[]> = Object.fromEntries(
      arvore.disciplinas.map((d) => {
        const porId = new Map<string, DocumentoExistente>();
        const comLocal = [
          ...d.arquivos.map((arquivo) => ({ arquivo, local: arquivo.pacote as string })),
          ...d.arquivosPasta.map((arquivo) => ({ arquivo, local: `pasta:${arquivo.pastaId}` })),
        ];
        for (const { arquivo, local } of comLocal) {
          const documentoId = arquivo.documentoCanonicoId ?? arquivo.documentoId;
          if (documentoId && !porId.has(documentoId)) porId.set(documentoId, { id: documentoId, nomeArquivo: arquivo.nome, local });
        }
        return [d.id, [...porId.values()]];
      }),
    );
    const existentesPorDisciplina: Record<string, ArquivoExistente[]> = Object.fromEntries(
      arvore.disciplinas.map((d) => [
        d.id,
        [
          ...d.arquivos.map((arquivo) => ({
            nome: arquivo.nome,
            pacote: arquivo.pacote,
            pastaId: null,
            versao: arquivo.versao,
          })),
          ...d.arquivosPasta.map((arquivo) => ({
            nome: arquivo.nome,
            pacote: null,
            pastaId: arquivo.pastaId,
            versao: arquivo.versao,
          })),
        ],
      ]),
    );
    // Seleção do painel esquerdo: id inválido/de outro projeto cai em "todas" — a árvore já
    // veio filtrada pela muralha por disciplina, então filtrar por ela nunca amplia o escopo.
    const selecionadaId =
      sp?.disciplinaId && disciplinasDoProjeto.some((d) => d.id === sp.disciplinaId) ? sp.disciplinaId : null;
    const listaSelecionadaId = sp?.listaId && listas.some((lista) => lista.id === sp.listaId) ? sp.listaId : null;
    // Filtro, ordenação e recorte acontecem no Postgres (F1-PR10): projeto com milhares de
    // arquivos não pode trafegar inteiro até o client a cada carga da tela.
    const filtros = {
      disciplinaId: selecionadaId,
      listaId: listaSelecionadaId,
      q: sp?.q,
      ext: sp?.ext,
      autor: sp?.autor,
      periodo: sp?.periodo,
      validado: sp?.val,
      fase: sp?.fase,
      status: sp?.status,
      tipo: sp?.tipo,
      papel: sp?.papel,
      catExt: sp?.catExt,
      pacote: sp?.pacote,
    };
    const lp = parseListParams(sp ?? {}, {
      sortFields: CAMPOS_ORDENACAO_DOC,
      defaultPageSize: 24,
    });
    const [pagina, opcoes, opcoesMetadados, documentosPorFase, arvoreNavegacao] = await Promise.all([
      listarDocumentosAgrupados({
        // Um id só: a aba do projeto não muda de escopo. A consulta passou a aceitar um
        // conjunto para o diretório geral reusar a mesma regra (ver `normalizarEscopoProjetos`).
        projetoIds: [id],
        userId: user.id,
        veTodas,
        ehGlobal,
        podeEnviarCap,
        podeEditarMetadados,
        podeAlterarStatus,
        filtros,
        skip: lp.skip,
        take: lp.take,
        sort: campoOrdenacaoDocValido(lp.sort),
        dir: lp.dir,
      }),
      opcoesFiltroDocumentos({ projetoId: id, userId: user.id, veTodas, disciplinaId: selecionadaId }),
      opcoesMetadadosDocumento(id),
      contagemDocumentosPorFase({ projetoId: id, userId: user.id, veTodas, disciplinaId: selecionadaId }),
      // Árvore do painel esquerdo: fases e formatos de TODAS as disciplinas visíveis (não do
      // recorte da página) — é navegação, tem de continuar mostrando para onde ir.
      arvoreNavegacaoDocumentos({ projetoIds: [id], userId: user.id, veTodas }),
    ]);
    // FONTE ÚNICA da contagem de documentos: `DocumentoDisciplina`, via árvore de navegação.
    //
    // Antes o total da disciplina era reconstruído a partir dos uploads
    // (`Set(documentoId ?? uploadId)`), enquanto fase e extensão já contavam documentos — dois
    // caminhos para a mesma unidade, que só não divergiam por sorte. Verificado em 2026-09-17:
    // os dois conjuntos batem id a id (145 documentos no dev, 49 disciplinas, com e sem muralha).
    //
    // Soma as FASES, nunca as extensões: um documento tem uma fase só, mas aparece em todas as
    // extensões dos seus arquivos (PDF+DWG conta nos dois) — somar extensões inflaria o número.
    //
    // Upload órfão (`documentoId: null`) deixa de ser contado. Era o único caso em que os dois
    // caminhos divergiam; a produção foi consultada em 2026-09-17 e tem ZERO.
    //
    // ATENÇÃO: órfão novo AINDA pode nascer. A rota de upload sempre grava `documentoId`, mas o
    // `autoStore` das Ferramentas (`modules/ferramentas/auto-store.ts`) cria Upload sem documento
    // nem revisão. Esse arquivo já não aparecia na tabela (que lista documentos) e agora também
    // não entra neste número — o comportamento fica coerente, mas o arquivo segue invisível na
    // aba. A correção é o autoStore passar pelo mesmo `chaveDocumento` da rota;
    // `scripts/reconciliar-uploads-orfaos.ts` conserta os que já existirem.
    const totalPorDisciplina = new Map(
      arvoreNavegacao.map((a) => [a.disciplinaId, a.fases.reduce((soma, f) => soma + f.total, 0)]),
    );
    const disciplinasArvore = disciplinasDoProjeto.map((d) => ({
      ...d,
      total: totalPorDisciplina.get(d.id) ?? 0,
    }));
    const totalDocumentos = disciplinasArvore.reduce((soma, d) => soma + d.total, 0);
    // Colunas visíveis: preferência do USUÁRIO (vale em qualquer projeto), resolvida no
    // servidor para a tabela já nascer com o recorte certo — sem piscar mostrando tudo.
    const prefs = await getPreferencias(user.id);
    const colunas = resolverColunasVisiveis(prefs[CHAVE_PREF_COLUNAS]);
    const colunasOcultas = idsOcultaveis().filter((id) => !colunas.has(id));
    const filtrosAtivos = [
      sp?.q, sp?.ext, sp?.autor, sp?.periodo, sp?.val, sp?.fase, sp?.status,
      sp?.tipo, sp?.papel, sp?.catExt, sp?.pacote,
    ].filter((v) => typeof v === "string" && v.trim() !== "").length;

    // Áreas do projeto (paridade com o explorer antigo): Recebidos, Base, Geral, ARTs e
    // Lixeira. Cada uma só é listada para quem pode vê-la — a permissão já foi resolvida
    // acima, aqui só decide a visibilidade do item de navegação.
    const areaSelecionada = areaValida(sp?.area);
    const areas: AreaDisponivel[] = [
      { id: "recebidos", total: recebidos.length, visivel: recebidos.length > 0 || podeGerirRecebidos },
      { id: "base", total: baseArquitetonica.length, visivel: true },
      { id: "geral", total: geral.length, visivel: podeVerGeral },
      { id: "arts", total: arts.length, visivel: arts.length > 0 },
      { id: "lixeira", total: lixeira.length, visivel: ehAdmin },
    ];

    return (
      <DocumentosShell
        projeto={projeto}
        exclusoesPendentes={new Set(exclusoesPendentes)}
        areas={areas}
        areaSelecionada={areaSelecionada}
        dadosAreas={{
          projetoId: id,
          clienteId,
          recebidos,
          baseArquitetonica,
          geral,
          arts,
          lixeira,
          podeGerirRecebidos,
          podeGerirGeral,
          podeExcluirDocumento,
        }}
        nomenclatura={{
          projeto: nomenclaturaProjeto,
          global: nomenclaturaDoEscritorio,
          siglasProjeto,
          podeEditar: podeEditarNomenclatura,
        }}
        linkPublico={
          podeGerirLink
            ? {
                disciplinas: arvore.disciplinas.map((d) => ({ id: d.id, nome: d.nome })),
                baseUrl,
                clienteEmail,
                links: linksPublicos.map(paraLinkData),
              }
            : null
        }
        disciplinas={disciplinasArvore}
        linhas={pagina.linhas}
        extensoes={opcoes.extensoes}
        autores={opcoes.autores}
        tipos={opcoesMetadados.tipos}
        papeis={opcoesMetadados.papeis}
        categoriasExtensao={opcoes.categoriasExtensao}
        pacotes={opcoes.pacotes}
        temFiltroAtivo={filtrosAtivos > 0}
        colunas={colunas}
        colunasOcultas={colunasOcultas}
        totalDocumentos={totalDocumentos}
        totalFiltrado={pagina.total}
        totalDisciplinas={disciplinasArvore.length}
        arvore={arvoreNavegacao}
        selecao={{ disciplinaId: selecionadaId, fase: sp?.fase ?? null, ext: sp?.ext ?? null }}
        listas={listas}
        listaSelecionadaId={listaSelecionadaId}
        podeGerirListas={podeGerirListas}
        paginacao={{ page: pagina.pagina, pageCount: pageCount(pagina.total, lp.pageSize), pageSize: lp.pageSize }}
        abrirEnvio={sp?.enviar === "1" && disciplinasEnviaveis.length > 0}
        dadosUploader={
          disciplinasEnviaveis.length > 0
            ? {
                disciplinas: disciplinasEnviaveis,
                nomenclatura,
                existentesPorDisciplina,
                fases: catalogos.fase,
                tipos: catalogos.tipo,
                codigoProjeto: projeto.codigo,
                projeto: { id: projeto.id, codigo: projeto.codigo, ano: projeto.ano, sequencial: projeto.sequencial },
                catalogosNomenclatura,
                extensoesNomenclatura,
                documentosPorDisciplina,
                podeEditarMetadados,
              }
            : null
        }
        fases={opcoesMetadados.fases}
        documentosPorFase={documentosPorFase}
        status={opcoesMetadados.status}
        podeCoordenacao={podeCoordenacao}
        podeValidar={podeValidar}
        podeExcluir={podeExcluirArquivo}
        podeSolicitarExclusao={!podeExcluirArquivo}
      />
    );
  }

  return (
    <ArquivosExplorer
      projeto={projeto}
      disciplinas={arvore.disciplinas}
      geral={geral}
      podeGerirGeral={podeGerirGeral}
      podeValidar={podeValidar}
      nomenclatura={nomenclatura}
      fases={catalogos.fase}
      tipos={catalogos.tipo}
      recebidos={recebidos}
      baseArquitetonica={baseArquitetonica}
      podeGerirBaseArquitetonica={podeGerirRecebidos}
      clienteId={clienteId}
      podeGerirRecebidos={podeGerirRecebidos}
      podeExcluirDocumento={podeExcluirDocumento}
      podeExcluirArquivo={ehAdmin}
      podeSolicitarExclusao={!ehAdmin}
      exclusoesPendentes={exclusoesPendentes}
      lixeira={lixeira}
      arts={arts}
      podeGerirLink={podeGerirLink}
      baseUrl={baseUrl}
      clienteEmail={clienteEmail}
      linksPublicos={linksPublicos.map(paraLinkData)}
    />
  );
}
