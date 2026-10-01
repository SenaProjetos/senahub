import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { transacoesPendentes } from "@/modules/financeiro/conciliacao/queries";
import { listarContasBancarias, listarCategorias } from "@/modules/financeiro/cadastros/queries";
import { ConciliacaoView } from "@/components/financeiro/conciliacao/conciliacao-view";

import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
export const metadata: Metadata = { title: "Conciliação bancária" };

export default async function ConciliacaoPage() {
  await requirePermission("financeiro", "conciliar");
  const [transacoes, contas, categorias] = await Promise.all([
    transacoesPendentes(),
    listarContasBancarias(),
    listarCategorias(),
  ]);
  return (
    <ConciliacaoView subnav={<NavFinanceiro />}
      transacoes={transacoes}
      contas={contas.map((c) => ({ id: c.id, nome: c.nome }))}
      categorias={categorias.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo }))}
    />
  );
}
