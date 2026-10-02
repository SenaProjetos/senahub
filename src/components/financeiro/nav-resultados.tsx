import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { itensDaNavFinanceiro } from "@/modules/financeiro/nav";
import { ResultadosTabs } from "@/components/financeiro/resultados-tabs";

/**
 * Abas dos Resultados (mock "Relatórios"): DRE · Rentabilidade · DFC · Balanço · Orçamento, as
 * cinco telas que respondem "como foi o resultado". São as MESMAS entradas do grupo "Resultados" da
 * subnavegação (`modules/financeiro/nav.ts`) — a faixa só as traz para dentro da página, porque
 * quem abre uma dessas telas quase sempre quer comparar com a vizinha.
 *
 * Gate igual ao da página de destino (I11): quem não tem `financeiro:resultados` não vê a aba que
 * lhe daria 403 — por isso a lista vem do servidor, não de uma constante no cliente.
 */
export async function NavResultados() {
  const user = await requireUser();
  const [ver, resultados] = await Promise.all([podeVerFinanceiro(user), can(user, "financeiro", "resultados")]);
  const nav = itensDaNavFinanceiro({ ver, resultados, aprovar: false, conciliar: false, gerir: false, fechar: false });
  if (nav.resultados.length < 2) return null;
  return <ResultadosTabs itens={nav.resultados.map((i) => ({ id: i.id, href: i.href, rotulo: i.rotulo }))} />;
}
