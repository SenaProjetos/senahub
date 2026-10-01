import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { inicioDoDiaUtc } from "@/lib/data";
import { fluxoCaixa } from "@/modules/financeiro/caixa/queries";
import { getConfigLiquidez } from "@/modules/financeiro/config/queries";
import { carregarRegras, recebimentosADistribuir } from "@/modules/financeiro/distribuicao/queries";
import { carregarCaixinhas, carregarMovimentos } from "@/modules/financeiro/caixinhas/queries";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { CaixinhasView } from "@/components/financeiro/caixinhas/caixinhas-view";

export const metadata: Metadata = { title: "Caixinhas" };

/**
 * Caixinhas (spec 2026-09-30 §4). Ler exige VER o Financeiro (inclui o piso de leitura do sócio);
 * reservar, liberar, transferir, ajustar e editar exigem `financeiro:gerir` — as actions conferem de
 * novo no servidor.
 */
export default async function CaixinhasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; caixinha?: string; arquivadas?: string }>;
}) {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");

  const sp = await searchParams;
  const aba = sp.aba === "extrato" ? "extrato" : "caixinhas";
  const arquivadas = sp.arquivadas === "1";
  const hoje = isoDeDataDoBanco(inicioDoDiaUtc());

  // Arquivadas ficam numa visão própria; o extrato lista as ativas e as arquivadas no filtro.
  const [todas, podeGerir, fluxo, config] = await Promise.all([
    carregarCaixinhas({ hoje, inativas: true }),
    can(user, "financeiro", "gerir"),
    fluxoCaixa(),
    getConfigLiquidez(),
  ]);
  const naAbaDeCartoes = aba === "caixinhas" && !arquivadas;
  const [regras, recebimentos] = naAbaDeCartoes
    ? await Promise.all([carregarRegras(), recebimentosADistribuir(config.distribuirDesde)])
    : [[], []];
  const caixinhas = aba === "extrato" ? todas : todas.filter((c) => c.ativo !== arquivadas);
  const caixinhaDoExtrato = aba === "extrato" && sp.caixinha && todas.some((c) => c.id === sp.caixinha) ? sp.caixinha : null;
  const movimentos = aba === "extrato" ? await carregarMovimentos({ caixinhaId: caixinhaDoExtrato ?? undefined }) : [];

  return (
    <CaixinhasView
      caixinhas={caixinhas}
      movimentos={movimentos}
      caixaAtual={paraCentavos(fluxo.saldoTotal)}
      hoje={hoje}
      aba={aba}
      arquivadas={arquivadas}
      caixinhaDoExtrato={caixinhaDoExtrato}
      podeGerir={podeGerir}
      recebimentos={recebimentos}
      regras={regras}
      distribuirDesde={config.distribuirDesde}
      subnav={<NavFinanceiro />}
    />
  );
}
