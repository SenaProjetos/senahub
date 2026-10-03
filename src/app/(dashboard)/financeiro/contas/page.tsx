import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { diaDeSaoPaulo } from "@/lib/data";
import { dadosContas, dadosPagas, opcoesLancamento, totalContasEmAberto } from "@/modules/financeiro/lancamentos/queries";
import { ContasPagarReceberView } from "@/components/financeiro/lancamentos/contas-pagar-receber-view";
import { PagasRecebidasView } from "@/components/financeiro/lancamentos/pagas-recebidas-view";
import { AbasContas } from "@/components/financeiro/lancamentos/abas-contas";
import { ParcelasAFaturarCard } from "@/components/financeiro/lancamentos/parcelas-a-faturar-card";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { parcelasAFaturar } from "@/modules/juridico/contrato/parcelas-a-faturar-queries";

export const metadata: Metadata = { title: "Contas" };

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; situacao?: string; mes?: string }>;
}) {
  const user = await requirePermission("financeiro", "ver");
  const { tab, situacao, mes: mesParam } = await searchParams;
  const podeGerir = await can(user, "financeiro", "gerir");

  if (situacao === "pagas") {
    const mes = mesParam && MES_VALIDO.test(mesParam) ? mesParam : diaDeSaoPaulo().slice(0, 7);
    const [itens, abertas, opcoesPagas] = await Promise.all([dadosPagas(mes), totalContasEmAberto(), opcoesLancamento()]);
    return (
      <PagasRecebidasView
        itens={itens}
        mes={mes}
        contas={opcoesPagas.contas}
        formas={opcoesPagas.formas}
        podeGerir={podeGerir}
        podeVerProducao={await can(user, "financeiro", "folha_pj")}
        subnav={
          <>
            <NavFinanceiro />
            <AbasContas ativa="pagas" abertas={abertas} pagas={itens.length} />
          </>
        }
      />
    );
  }

  const [itens, opcoes] = await Promise.all([dadosContas(), opcoesLancamento()]);
  const tabInicial = tab === "receita" ? "receita" : "despesa";
  // Faturar é lançar dinheiro: a lista de parcelas a faturar é de quem gere o financeiro.
  const aFaturar = podeGerir ? await parcelasAFaturar() : [];
  return (
    <ContasPagarReceberView
      itens={itens}
      opcoes={opcoes}
      tabInicial={tabInicial}
      podeGerir={podeGerir}
      topoReceita={aFaturar.length > 0 ? <ParcelasAFaturarCard parcelas={aFaturar} /> : undefined}
      subnav={
        <>
          <NavFinanceiro />
          <AbasContas ativa="aberto" abertas={itens.length} />
        </>
      }
    />
  );
}
