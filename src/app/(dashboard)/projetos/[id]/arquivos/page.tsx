import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can, podeAtuarEmDisciplinaAlheia } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { arvoreArquivosProjeto } from "@/modules/projetos/arquivos/queries";
import { lixeiraDoProjeto, pedidosExclusaoPendentesDoProjeto } from "@/modules/uploads/queries";
import {
  recebidosDoProjeto,
  geralDoProjeto,
  baseArquitetonicaDoProjeto,
  clienteDoProjeto,
  emailClienteDoProjeto,
} from "@/modules/documentos-cliente/queries";
import { podeGerirDocumento } from "@/modules/documentos-cliente/acesso";
import { podeVerTodasDisciplinas, podeEnviarArquivo } from "@/modules/arquivos/acesso";
import { fasesParaLink, linksArquivosDoProjeto } from "@/modules/projetos/arquivos/link-publico";
import { listarArtsDoProjeto } from "@/modules/projetos/art/queries";
import { catalogosPrancha } from "@/modules/projetos/pranchas/queries";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { TelaDocumentosProjeto, paraLinkData, type ParamsTelaDocumentos } from "@/components/projetos/arquivos/tela-documentos-projeto";
import { ArquivosExplorer } from "@/components/projetos/arquivos-explorer";

export const metadata: Metadata = { title: "Arquivos" };

export default async function ArquivosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParamsTelaDocumentos & { docsv2?: string }>;
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

  if (documentosV2) {
    return <TelaDocumentosProjeto user={user} projeto={projeto} sp={sp} />;
  }

  // Tela antiga (`ArquivosExplorer`), atrás da flag: só ela usa as consultas abaixo.
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
  // Filtro de fase do link (F4): só quem gere o link abre o diálogo, então só ele paga a consulta.
  const fasesLink = podeGerirLink ? await fasesParaLink(id) : undefined;
  const baseUrl = process.env.APP_URL ?? "";
  // Pasta "Geral" (Documento origem=interno) só é carregada p/ quem tem `arquivos_gerais:ver`.
  const geral = podeVerGeral ? await geralDoProjeto(id) : [];
  // Lixeira do projeto: só admin (gate da action) — os demais recebem lista vazia.
  const ehAdmin = user.superUsuario;
  const lixeira = ehAdmin ? await lixeiraDoProjeto(id) : [];
  // Pedidos de exclusão pendentes: o admin vê todos (é quem decide); os demais só o
  // próprio pedido, pra não expor que outra pessoa quer excluir aquele arquivo.
  const exclusoesPendentes = await pedidosExclusaoPendentesDoProjeto(id, ehAdmin ? undefined : user.id);

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
      fasesLink={fasesLink}
    />
  );
}
