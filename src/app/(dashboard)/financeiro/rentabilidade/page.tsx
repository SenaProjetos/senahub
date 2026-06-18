import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { rentabilidadePorProjeto } from "@/modules/financeiro/relatorios/queries";
import { RentabilidadeView } from "@/components/financeiro/relatorios/rentabilidade-view";

export const metadata: Metadata = { title: "Rentabilidade por projeto" };

function periodoPadrao(sp: { de?: string; ate?: string }) {
  const hoje = new Date();
  const de = sp.de ? new Date(sp.de) : new Date(hoje.getFullYear(), 0, 1);
  const ate = sp.ate ? new Date(sp.ate) : new Date(hoje.getFullYear(), 11, 31);
  return { de, ate };
}

export default async function RentabilidadePage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; margem?: string }>;
}) {
  await requirePermission("financeiro", "ver");
  const sp = await searchParams;
  const { de, ate } = periodoPadrao(sp);
  const margem = sp.margem ? Number(sp.margem) : 0;
  const dados = await rentabilidadePorProjeto(de, ate, Number.isFinite(margem) ? margem : 0);
  return <RentabilidadeView dados={dados} />;
}
