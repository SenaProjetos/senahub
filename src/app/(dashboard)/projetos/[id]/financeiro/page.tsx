import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { margemProjeto } from "@/modules/projetos/queries";
import { receitaProjeto } from "@/modules/projetos/receita/queries";
import { planoVsRealProjeto } from "@/modules/planejamento/queries";
import { evmProjeto } from "@/modules/projetos/evm/queries";
import { ReceitaContratoCard } from "@/components/projetos/receita-contrato-card";
import { MargemCard } from "@/components/projetos/margem-card";
import { PlanoRealCard } from "@/components/projetos/plano-real-card";
import { EvmCard } from "@/components/projetos/evm-card";

export const metadata: Metadata = { title: "Financeiro — Projeto" };

export default async function ProjetoFinanceiroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const [podeGerir, podeVerFinanceiro] = await Promise.all([
    can(user.role, "projetos", "gerir"),
    can(user.role, "financeiro", "ver"),
  ]);

  if (!podeVerFinanceiro) {
    return (
      <p className="text-sm text-muted-foreground">
        Você não tem permissão para ver as informações financeiras deste projeto.
      </p>
    );
  }

  const [margem, receita, planoReal, evm] = await Promise.all([
    margemProjeto(id),
    receitaProjeto(id),
    podeGerir ? planoVsRealProjeto(id) : null,
    evmProjeto(id),
  ]);

  return (
    <div className="space-y-6">
      <ReceitaContratoCard projetoId={id} receita={receita} />
      <MargemCard margem={margem} />
      {evm && <EvmCard evm={evm} />}
      {planoReal && planoReal.linhas.length > 0 && <PlanoRealCard planoReal={planoReal} />}
      <div className="flex gap-3 text-xs">
        <Link
          href={`/financeiro/lancamentos?projetoId=${id}&novo=1`}
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          + Novo lançamento neste projeto
        </Link>
        <span className="text-border">·</span>
        <Link
          href={`/financeiro/lancamentos?projetoId=${id}`}
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          Ver lançamentos →
        </Link>
      </div>
    </div>
  );
}
