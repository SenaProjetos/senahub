import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { obterOrcamento } from "@/modules/custos/queries";
import { arvoreDoOrcamento, basesDisponiveis } from "@/modules/custos/orcamento/queries";
import { listarQuantitativos, contarVinculosPorItem, pdfsDoProjeto } from "@/modules/custos/quantitativos/queries";
import { modelosCoordenacao } from "@/modules/coordenacao/queries";
import { desenhosConvertidos } from "@/modules/dwg/queries";
import { OrcamentoDetalheView } from "@/components/custos/orcamento-detalhe-view";

export const metadata: Metadata = { title: "Orçamento — Engenharia de Custos" };

const ABAS = ["itens", "cabecalho", "bdi", "encargos", "quantitativos"] as const;
type Aba = (typeof ABAS)[number];

export default async function OrcamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const user = await requirePermission("custos", "ver");
  const { id } = await params;
  const sp = await searchParams;
  const aba: Aba = (ABAS as readonly string[]).includes(sp.aba ?? "") ? (sp.aba as Aba) : "itens";

  const [orcamento, podeGerir, podeGerirBancos, podeVerCoordenacao] = await Promise.all([
    obterOrcamento(id, user),
    can(user.role, "custos", "gerir"),
    can(user.role, "custos", "bancos"),
    can(user.role, "coordenacao", "ver"),
  ]);
  if (!orcamento) notFound();

  const projetoId = orcamento.projetoId;
  const [arvore, bases, cabecalho, quantitativos, modelosIfcBrutos, desenhosDxf, pdfs] = await Promise.all([
    arvoreDoOrcamento(id),
    basesDisponiveis(),
    prisma.custoOrcamento.findUnique({ where: { id }, select: { basePrecoId: true } }),
    listarQuantitativos(id),
    projetoId && podeVerCoordenacao ? modelosCoordenacao(projetoId) : Promise.resolve([]),
    projetoId ? desenhosConvertidos(projetoId) : Promise.resolve([]),
    projetoId ? pdfsDoProjeto(projetoId) : Promise.resolve([]),
  ]);

  const modelosIfc = modelosIfcBrutos
    .filter((m) => m.conversao?.status === "concluido")
    .map((m) => ({ uploadId: m.uploadId, nomeArquivo: m.nomeArquivo, disciplinaNome: m.disciplinaNome }));

  const vinculosPorItem = Object.fromEntries(await contarVinculosPorItem(arvore.itens.map((i) => i.id)));

  return (
    <OrcamentoDetalheView
      orcamento={orcamento}
      arvore={arvore}
      bases={bases}
      basePrecoId={cabecalho?.basePrecoId ?? null}
      aba={aba}
      podeGerir={podeGerir}
      podeGerirBancos={podeGerirBancos}
      quantitativos={quantitativos}
      modelosIfc={modelosIfc}
      desenhosDxf={desenhosDxf}
      pdfs={pdfs}
      vinculosPorItem={vinculosPorItem}
    />
  );
}
