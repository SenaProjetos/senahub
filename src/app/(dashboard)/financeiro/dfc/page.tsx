import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { relatorioDFC, categoriasParaDfc } from "@/modules/financeiro/relatorios/queries";
import { DfcView } from "@/components/financeiro/dfc-view";

export const metadata: Metadata = { title: "DFC" };

export default async function DfcPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const user = await requirePermission("financeiro", "ver");
  const sp = await searchParams;
  const ano = Number(sp.ano) || new Date().getFullYear();
  const [dfc, categorias, podeGerir] = await Promise.all([
    relatorioDFC(new Date(ano, 0, 1), new Date(ano, 11, 31, 23, 59, 59)),
    categoriasParaDfc(),
    can(user.role, "financeiro", "gerir"),
  ]);
  return <DfcView ano={ano} dfc={dfc} categorias={categorias} podeGerir={podeGerir} />;
}
