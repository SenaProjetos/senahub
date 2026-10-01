import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getConfigLiquidez } from "@/modules/financeiro/config/queries";
import { HORIZONTES_DIAS } from "@/modules/financeiro/config/liquidez";
import { alvoDoAjuste } from "@/modules/financeiro/liquidez/simulacao";
import { baseDoPlanejador, observadosAtuais } from "@/modules/financeiro/liquidez/queries";
import { podeEditarCenario } from "@/modules/financeiro/planejador/cenarios/acoes";
import { cenarioPorId } from "@/modules/financeiro/planejador/cenarios/queries";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { PlanejadorView } from "@/components/financeiro/planejador/planejador-view";

export const metadata: Metadata = { title: "Planejador de caixa" };

/**
 * Planejador de caixa (spec 2026-09-30). Ler e simular só exige VER o Financeiro (inclui o piso de
 * leitura do sócio): a simulação roda no navegador e não grava nada. Salvar cenário exige
 * `financeiro:ver`; reserva mínima e "Aplicar ao financeiro" exigem `financeiro:gerir` — as actions
 * conferem de novo no servidor.
 */
export default async function PlanejadorPage({ searchParams }: { searchParams: Promise<{ horizonte?: string; cenario?: string }> }) {
  const user = await requireUser();
  if (!(await podeVerFinanceiro(user))) redirect("/sem-permissao");

  const sp = await searchParams;
  const config = await getConfigLiquidez();
  const cenario = sp.cenario ? await cenarioPorId(sp.cenario, config.horizontePadraoDias) : null;
  if (sp.cenario && !cenario) redirect("/financeiro/cenarios");

  // Horizonte: o da URL; sem ele, o do cenário aberto; sem cenário, o padrão da configuração.
  const pedido = Number(sp.horizonte);
  const horizonte = (HORIZONTES_DIAS as readonly number[]).includes(pedido) ? pedido : cenario?.premissas.horizonteDias;

  const [base, podeGerir, podeSalvar, categorias] = await Promise.all([
    baseDoPlanejador({ horizonteDias: horizonte }),
    can(user, "financeiro", "gerir"),
    can(user, "financeiro", "ver"),
    prisma.categoriaFinanceira.findMany({
      where: { ativo: true, natureza: { not: "transferencia" } },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, nome: true, tipo: true },
    }),
  ]);

  // Alvos do cenário que não estão na projeção (pagos, excluídos, além do horizonte): a foto de agora
  // diz à tela se o ajuste ficou obsoleto.
  const naBase = new Set(base.eventos.map((e) => e.id));
  const fora = (cenario?.ajustes ?? []).map(alvoDoAjuste).filter((id): id is string => !!id && !naBase.has(id));
  const observadosExtras = fora.length ? await observadosAtuais(fora) : {};

  return (
    <PlanejadorView
      key={cenario?.id ?? "rascunho"}
      base={base}
      config={config}
      podeGerir={podeGerir}
      podeSalvar={podeSalvar}
      cenario={cenario}
      cenarioEditavel={cenario ? podeEditarCenario({ autorId: cenario.autor.id }, { usuarioId: user.id, podeSalvar, podeGerir }) : false}
      observadosExtras={observadosExtras}
      categorias={categorias}
      subnav={<NavFinanceiro />}
    />
  );
}
