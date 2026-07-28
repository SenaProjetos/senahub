import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { obterComposicao, listarBasesPreco } from "@/modules/custos/composicoes/queries";
import { ComposicaoDetalheView } from "@/components/custos/bancos/composicao-detalhe-view";

export const metadata: Metadata = { title: "Composição — Engenharia de Custos" };

export default async function ComposicaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ base?: string }>;
}) {
  const user = await requirePermission("custos", "ver");
  const { id } = await params;
  const sp = await searchParams;

  const bases = await listarBasesPreco();
  const basePrecoId = sp.base ?? bases[0]?.id;

  const [composicao, podeGerir] = await Promise.all([
    obterComposicao(id, basePrecoId),
    can(user.role, "custos", "bancos"),
  ]);
  if (!composicao) notFound();

  return <ComposicaoDetalheView composicao={composicao} bases={bases} basePrecoId={basePrecoId ?? null} podeGerir={podeGerir} />;
}
