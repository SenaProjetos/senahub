import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { GLOBAL_ROLES } from "@/lib/roles";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { arvoreArquivosProjeto } from "@/modules/projetos/arquivos/queries";
import { lixeiraDoProjeto, pedidosExclusaoPendentesDoProjeto } from "@/modules/uploads/queries";
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
import { linhasDeDocumentos, filtrarLinhas, contarFiltros } from "@/modules/uploads/lista-documentos";

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
      total: d.arquivos.length + d.arquivosPasta.length,
      podeEnviar: d.podeEnviar,
    }));
    const totalDocumentos = disciplinasArvore.reduce((soma, d) => soma + d.total, 0);
    // Seleção do painel esquerdo: id inválido/de outro projeto cai em "todas" — a árvore já
    // veio filtrada pela muralha por disciplina, então filtrar por ela nunca amplia o escopo.
    const selecionadaId =
      sp?.disciplinaId && disciplinasArvore.some((d) => d.id === sp.disciplinaId) ? sp.disciplinaId : null;
    const todasLinhas = linhasDeDocumentos(
      selecionadaId ? arvore.disciplinas.filter((d) => d.id === selecionadaId) : arvore.disciplinas,
    );
    // Opções dos selects saem dos dados reais da disciplina em foco — nada de lista fixa.
    const extensoes = [...new Set(todasLinhas.map((l) => l.ext).filter(Boolean))].sort();
    const autores = [...new Set(todasLinhas.map((l) => l.autor))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const filtros = { q: sp?.q, ext: sp?.ext, autor: sp?.autor, periodo: sp?.periodo, validado: sp?.val };
    const linhas = filtrarLinhas(todasLinhas, filtros);
    return (
      <DocumentosShell
        projeto={projeto}
        disciplinas={disciplinasArvore}
        linhas={linhas}
        extensoes={extensoes}
        autores={autores}
        temFiltroAtivo={contarFiltros(filtros) > 0}
        totalDocumentos={totalDocumentos}
        totalDisciplinas={disciplinasArvore.length}
        disciplinaSelecionadaId={selecionadaId}
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
