import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { diaDeSaoPaulo } from "@/lib/data";
import { contasDoExtrato, extratoDaConta } from "@/modules/financeiro/extrato/queries";
import { ExtratoView } from "@/components/financeiro/extrato/extrato-view";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { EmptyState } from "@/components/ui/empty-state";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Extrato por conta" };

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<{ conta?: string; mes?: string }> }) {
  const user = await requirePermission("financeiro", "ver");
  const { conta, mes: mesParam } = await searchParams;
  const [contas, podeGerir, podeConciliar] = await Promise.all([contasDoExtrato(), can(user, "financeiro", "gerir"), can(user, "financeiro", "conciliar")]);

  if (contas.length === 0) {
    return (
      <div className="space-y-4">
        <CabecalhoPagina titulo="Extrato por conta" descricao="Saldo corrido, o que já foi conciliado e o que falta." />
        <NavFinanceiro />
        <EmptyState icon={Wallet} title="Nenhuma conta bancária cadastrada." description="Cadastre as contas em Financeiro → Cadastros." />
      </div>
    );
  }

  const escolhida = contas.find((c) => c.id === conta) ?? contas[0];
  const mes = mesParam && MES_VALIDO.test(mesParam) ? mesParam : diaDeSaoPaulo().slice(0, 7);
  const dados = await extratoDaConta(escolhida.id, mes);
  return <ExtratoView dados={dados} contas={contas} podeGerir={podeGerir} podeConciliar={podeConciliar} subnav={<NavFinanceiro />} />;
}
