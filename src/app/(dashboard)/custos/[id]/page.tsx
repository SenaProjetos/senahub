import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { obterOrcamento } from "@/modules/custos/queries";
import { arvoreDoOrcamento, basesDisponiveis } from "@/modules/custos/orcamento/queries";
import { OrcamentoDetalheView } from "@/components/custos/orcamento-detalhe-view";

export const metadata: Metadata = { title: "Orçamento — Engenharia de Custos" };

const ABAS = ["itens", "cabecalho", "bdi", "encargos"] as const;
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

  const [orcamento, podeGerir, arvore, bases, cabecalho] = await Promise.all([
    obterOrcamento(id, user),
    can(user.role, "custos", "gerir"),
    arvoreDoOrcamento(id),
    basesDisponiveis(),
    prisma.custoOrcamento.findUnique({ where: { id }, select: { basePrecoId: true } }),
  ]);
  if (!orcamento) notFound();

  return (
    <OrcamentoDetalheView
      orcamento={orcamento}
      arvore={arvore}
      bases={bases}
      basePrecoId={cabecalho?.basePrecoId ?? null}
      aba={aba}
      podeGerir={podeGerir}
    />
  );
}
