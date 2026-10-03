import type { Metadata } from "next";
import { diaDeSaoPaulo, somarMesesUtc, utcInicioDoDia, utcFimDoDia } from "@/lib/data";
import { requirePermission } from "@/lib/session";
import { evolucaoReceitaDespesaMeses, indicadoresGerenciais } from "@/modules/financeiro/relatorios/queries";
import { IndicadoresView, type PeriodoIndicadores } from "@/components/financeiro/relatorios/indicadores-view";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { NavResultados } from "@/components/financeiro/nav-resultados";

export const metadata: Metadata = { title: "Indicadores" };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const PERIODOS: PeriodoIndicadores[] = ["anterior", "mes", "trimestre", "12m"];

export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; base?: string }>;
}) {
  await requirePermission("financeiro", "resultados");
  const sp = await searchParams;
  const periodo: PeriodoIndicadores = PERIODOS.includes(sp.periodo as PeriodoIndicadores) ? (sp.periodo as PeriodoIndicadores) : "mes";
  const base = sp.base === "competencia" ? "competencia" : "caixa";

  // Mês corrente pelo dia de São Paulo (N2), em meia-noite UTC.
  const [ano, mes] = diaDeSaoPaulo().split("-").map(Number);
  const mesAtual = utcInicioDoDia(ano, mes - 1);
  const mesAnterior = somarMesesUtc(mesAtual, -1);
  const fimDoMes = (d: Date) => utcFimDoDia(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
  const nomeDoMes = (d: Date) => MESES[d.getUTCMonth()];

  const { de, ate, comparadoCom } =
    periodo === "anterior"
      ? { de: mesAnterior, ate: fimDoMes(mesAnterior), comparadoCom: nomeDoMes(somarMesesUtc(mesAtual, -2)) }
      : periodo === "trimestre"
        ? { de: somarMesesUtc(mesAtual, -2), ate: fimDoMes(mesAtual), comparadoCom: "o trimestre anterior" }
        : periodo === "12m"
          ? { de: somarMesesUtc(mesAtual, -11), ate: fimDoMes(mesAtual), comparadoCom: "os 12 meses anteriores" }
          : { de: mesAtual, ate: fimDoMes(mesAtual), comparadoCom: nomeDoMes(mesAnterior) };

  const [ind, evolucao] = await Promise.all([indicadoresGerenciais(de, ate, base), evolucaoReceitaDespesaMeses(ate, 6, base)]);

  const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <IndicadoresView
      ind={ind}
      evolucao={evolucao}
      periodo={periodo}
      base={base}
      rotulos={{ anterior: capital(nomeDoMes(mesAnterior)), mes: capital(nomeDoMes(mesAtual)), trimestre: "Trimestre", "12m": "12 meses" }}
      comparadoCom={comparadoCom}
      subnav={
        <>
          <NavFinanceiro />
          <NavResultados />
        </>
      }
    />
  );
}
