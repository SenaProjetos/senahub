import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import {
  relatorioDREComparativo,
  indicadores,
  totaisPorCategoria,
  resultadoPorProjeto,
  evolucaoMensalCategorias,
} from "@/modules/financeiro/relatorios/queries";
import { RelatoriosView } from "@/components/financeiro/relatorios/relatorios-view";

export const metadata: Metadata = { title: "Relatórios" };

function periodoPadrao(sp: { de?: string; ate?: string }) {
  const hoje = new Date();
  const de = sp.de ? new Date(sp.de) : new Date(hoje.getFullYear(), 0, 1);
  const ate = sp.ate ? new Date(sp.ate) : new Date(hoje.getFullYear(), 11, 31);
  return { de, ate };
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; base?: string }>;
}) {
  await requirePermission("financeiro", "ver");
  const sp = await searchParams;
  const { de, ate } = periodoPadrao(sp);
  const base = sp.base === "competencia" ? "competencia" : "caixa";
  const ano = ate.getFullYear();
  const [dre, ind, despesasCat, receitasCat, porProjeto, evolucao] = await Promise.all([
    relatorioDREComparativo(de, ate, base),
    indicadores(de, ate),
    totaisPorCategoria("despesa", de, ate),
    totaisPorCategoria("receita", de, ate),
    resultadoPorProjeto(de, ate),
    evolucaoMensalCategorias("despesa", ano),
  ]);
  return (
    <RelatoriosView
      dre={dre}
      indicadores={ind}
      despesasCat={despesasCat}
      receitasCat={receitasCat}
      porProjeto={porProjeto}
      evolucao={evolucao}
      base={base}
    />
  );
}
