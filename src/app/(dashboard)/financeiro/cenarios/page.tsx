import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { getConfigLiquidez } from "@/modules/financeiro/config/queries";
import { EIXOS_PADRAO } from "@/modules/financeiro/liquidez/cenario";
import { baseDoPlanejador } from "@/modules/financeiro/liquidez/queries";
import { listarCenarios } from "@/modules/financeiro/planejador/cenarios/queries";
import { resumoDoCenario } from "@/modules/financeiro/planejador/cenarios/resumo";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { CenariosView } from "@/components/financeiro/planejador/cenarios-view";

export const metadata: Metadata = { title: "Cenários salvos" };

/**
 * Cenários salvos do planejador (spec §11). Mesmo gate do planejador para ler (inclui o sócio que só
 * lê); salvar, duplicar e arquivar exigem `financeiro:ver`, e as actions conferem de novo.
 */
export default async function CenariosPage({ searchParams }: { searchParams: Promise<{ arquivados?: string }> }) {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");

  const arquivados = (await searchParams).arquivados === "1";
  const config = await getConfigLiquidez();
  const cenarios = await listarCenarios({ arquivados, horizontePadrao: config.horizontePadraoDias });

  // Uma base só, no maior horizonte da lista; cada cenário projeta no próprio horizonte.
  const maior = Math.max(config.horizontePadraoDias, ...cenarios.map((c) => c.premissas.horizonteDias));
  const [base, podeGerir, podeSalvar] = await Promise.all([
    baseDoPlanejador({ horizonteDias: maior }),
    can(user, "financeiro", "gerir"),
    can(user, "financeiro", "ver"),
  ]);

  return (
    <CenariosView
      cenarios={cenarios.map((c) => ({ ...c, resumo: resumoDoCenario(base, c.premissas, c.ajustes) }))}
      atual={resumoDoCenario(base, { eixos: EIXOS_PADRAO, horizonteDias: config.horizontePadraoDias }, [])}
      caixaAtual={base.caixaAtual}
      reservaMinima={base.reservaMinima}
      arquivados={arquivados}
      ctx={{ usuarioId: user.id, podeSalvar, podeGerir }}
      subnav={<NavFinanceiro />}
    />
  );
}
