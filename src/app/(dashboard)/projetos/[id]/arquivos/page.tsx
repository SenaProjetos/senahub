import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { GLOBAL_ROLES } from "@/lib/roles";
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
} from "@/modules/uploads/documentos-agrupados";
import { parseListParams, pageCount } from "@/lib/list-params";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";
import { resolverColunasVisiveis, CHAVE_PREF_COLUNAS, idsOcultaveis } from "@/modules/uploads/colunas-documento";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import {
  recebidosDoProjeto,
  geralDoProjeto,
  baseArquitetonicaDoProjeto,
  clienteDoProjeto,
  emailClienteDoProjeto,
} from "@/modules/documentos-cliente/queries";
import { podeGerirDocumento } from "@/modules/documentos-cliente/acesso";
import { podeVerTodasDisciplinas, podeEnviarArquivo } from "@/modules/arquivos/acesso";
import { linkArquivosDoProjeto } from "@/modules/projetos/arquivos/link-publico";
import { listarArtsDoProjeto } from "@/modules/projetos/art/queries";
import { ArquivosExplorer } from "@/components/projetos/arquivos-explorer";
import { DocumentosShell } from "@/components/projetos/arquivos/documentos-shell";

export const metadata: Metadata = { title: "Arquivos" };

export default async function ArquivosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    docsv2?: string;
    disciplinaId?: string;
    q?: string;
    ext?: string;
    autor?: string;
    periodo?: string;
    val?: string;
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

  const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role);
  const [veTodas, podeEnviarCap] = await Promise.all([
    podeVerTodasDisciplinas(user),
    podeEnviarArquivo(user),
  ]);
  const [arvore, podeVerGeral, podeGerirGeral, podeValidar, nomenclatura, recebidos, baseArquitetonica, clienteId, podeGerirRecebidos, podeGerirLink, linkPublico, clienteEmail] =
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
      linkArquivosDoProjeto(id),
      emailClienteDoProjeto(id),
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
    const [podeCoordenacao, podeExcluirCap] = await Promise.all([
      can(user, "coordenacao", "ver"),
      can(user, "arquivos", "excluir"),
    ]);
    const podeExcluirArquivo = ehAdmin || podeExcluirCap;
    const disciplinasArvore = arvore.disciplinas.map((d) => ({
      id: d.id,
      nome: d.nome,
      status: d.status,
      // O painel e o cabeçalho passam a contar documentos lógicos, não Uploads. Arquivos
      // legados sem pai ainda contam como uma unidade, para o número nunca esconder dado.
      total: new Set([...d.arquivos, ...d.arquivosPasta].map((arquivo) => arquivo.documentoId ?? arquivo.id)).size,
      podeEnviar: d.podeEnviar,
    }));
    const totalDocumentos = disciplinasArvore.reduce((soma, d) => soma + d.total, 0);
    // Seleção do painel esquerdo: id inválido/de outro projeto cai em "todas" — a árvore já
    // veio filtrada pela muralha por disciplina, então filtrar por ela nunca amplia o escopo.
    const selecionadaId =
      sp?.disciplinaId && disciplinasArvore.some((d) => d.id === sp.disciplinaId) ? sp.disciplinaId : null;
    // Filtro, ordenação e recorte acontecem no Postgres (F1-PR10): projeto com milhares de
    // arquivos não pode trafegar inteiro até o client a cada carga da tela.
    const filtros = {
      disciplinaId: selecionadaId,
      q: sp?.q,
      ext: sp?.ext,
      autor: sp?.autor,
      periodo: sp?.periodo,
      validado: sp?.val,
    };
    const lp = parseListParams(sp ?? {}, {
      sortFields: CAMPOS_ORDENACAO_DOC,
      defaultPageSize: 24,
    });
    const [pagina, opcoes] = await Promise.all([
      listarDocumentosAgrupados({
        projetoId: id,
        userId: user.id,
        veTodas,
        ehGlobal,
        podeEnviarCap,
        filtros,
        skip: lp.skip,
        take: lp.take,
        sort: campoOrdenacaoDocValido(lp.sort),
        dir: lp.dir,
      }),
      opcoesFiltroDocumentos({ projetoId: id, userId: user.id, veTodas, disciplinaId: selecionadaId }),
    ]);
    // Colunas visíveis: preferência do USUÁRIO (vale em qualquer projeto), resolvida no
    // servidor para a tabela já nascer com o recorte certo — sem piscar mostrando tudo.
    const prefs = await getPreferencias(user.id);
    const colunas = resolverColunasVisiveis(prefs[CHAVE_PREF_COLUNAS]);
    const colunasOcultas = idsOcultaveis().filter((id) => !colunas.has(id));
    const filtrosAtivos = [sp?.q, sp?.ext, sp?.autor, sp?.periodo, sp?.val].filter(
      (v) => typeof v === "string" && v.trim() !== "",
    ).length;

    return (
      <DocumentosShell
        projeto={projeto}
        disciplinas={disciplinasArvore}
        linhas={pagina.linhas}
        extensoes={opcoes.extensoes}
        autores={opcoes.autores}
        temFiltroAtivo={filtrosAtivos > 0}
        colunas={colunas}
        colunasOcultas={colunasOcultas}
        totalDocumentos={totalDocumentos}
        totalFiltrado={pagina.total}
        totalDisciplinas={disciplinasArvore.length}
        disciplinaSelecionadaId={selecionadaId}
        paginacao={{ page: pagina.pagina, pageCount: pageCount(pagina.total, lp.pageSize), pageSize: lp.pageSize }}
        podeEnviar={podeEnviarCap}
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
      recebidos={recebidos}
      baseArquitetonica={baseArquitetonica}
      podeGerirBaseArquitetonica={podeGerirRecebidos}
      clienteId={clienteId}
      podeGerirRecebidos={podeGerirRecebidos}
      podeExcluirDocumento={ehGlobal}
      podeExcluirArquivo={ehAdmin}
      podeSolicitarExclusao={!ehAdmin}
      exclusoesPendentes={exclusoesPendentes}
      lixeira={lixeira}
      arts={arts}
      podeGerirLink={podeGerirLink}
      baseUrl={baseUrl}
      clienteEmail={clienteEmail}
      linkPublico={
        linkPublico
          ? {
              token: linkPublico.token,
              ativo: linkPublico.ativo,
              expiraEm: linkPublico.expiraEm ? linkPublico.expiraEm.toISOString() : null,
              disciplinaIds: linkPublico.disciplinaIds,
            }
          : null
      }
    />
  );
}
