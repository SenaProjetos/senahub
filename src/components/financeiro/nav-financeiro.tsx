import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { FinanceiroNav } from "@/components/financeiro/financeiro-nav";
import { itensDaNavFinanceiro, todosOsItens } from "@/modules/financeiro/nav";
import { totalContasVencidas } from "@/modules/financeiro/lancamentos/queries";
import { totalAguardando } from "@/modules/financeiro/aprovacao/queries";
import { totalTransacoesPendentes } from "@/modules/financeiro/conciliacao/queries";

/**
 * Subnavegação do Financeiro com as permissões já resolvidas. Cada tela a desenha logo DEPOIS do
 * próprio `CabecalhoPagina` (que precisa ser o 1º elemento para subir para a barra do topo).
 * Quem não alcança nenhuma tela do Financeiro (ex.: só "Meu extrato") não recebe barra.
 */
export async function NavFinanceiro() {
  const user = await requireUser();
  const [ver, resultados, aprovar, conciliar, gerir, fechar, folhaPj] = await Promise.all([
    podeVerFinanceiro(user),
    can(user, "financeiro", "resultados"),
    can(user, "financeiro", "aprovar"),
    can(user, "financeiro", "conciliar"),
    can(user, "financeiro", "gerir"),
    can(user, "financeiro", "fechar"),
    can(user, "financeiro", "folha_pj"),
  ]);
  const nav = itensDaNavFinanceiro({ ver, resultados, aprovar, conciliar, gerir, fechar, folhaPj });
  if (todosOsItens(nav).length === 0) return null;

  const [aguardando, pendentesConciliacao, vencidas] = await Promise.all([
    aprovar ? totalAguardando() : 0,
    conciliar ? totalTransacoesPendentes() : 0,
    ver ? totalContasVencidas() : 0,
  ]);
  // `useSearchParams` no cliente exige Suspense para a página continuar renderizável no servidor.
  return (
    <Suspense fallback={null}>
      <FinanceiroNav nav={nav} contagens={{ aprovacoes: aguardando, conciliacao: pendentesConciliacao, contas: vencidas }} />
    </Suspense>
  );
}
