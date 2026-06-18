import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarFechamentos } from "@/modules/financeiro/fechamento/queries";
import { FechamentoView } from "@/components/financeiro/fechamento/fechamento-view";

export const metadata: Metadata = { title: "Fechamento mensal" };

export default async function FechamentoPage() {
  await requirePermission("financeiro", "gerir");
  const fechamentos = await listarFechamentos();
  const hoje = new Date();
  return <FechamentoView fechamentos={fechamentos} anoAtual={hoje.getFullYear()} mesAtual={hoje.getMonth() + 1} />;
}
