import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import {
  projetoVisivel,
  eapDoProjeto,
  planoVsRealProjeto,
  cronogramaProjetoInfo,
  qualidadeDoProjeto,
  pessoasParaAtribuicao,
} from "@/modules/planejamento/queries";
import { EapWorkspace } from "@/components/planejamento/eap-workspace";
import { PlanoVsReal } from "@/components/planejamento/plano-vs-real";

export const metadata: Metadata = { title: "Planejamento do projeto" };

export default async function PlanejamentoProjetoPage({
  params,
}: {
  params: Promise<{ projetoId: string }>;
}) {
  const { projetoId } = await params;
  const user = await requirePermission("planejamento", "ver");
  const projeto = await projetoVisivel(user, projetoId);
  if (!projeto) notFound();
  const verCusto = await podeVerFinanceiro(user);

  const [
    { tarefas, disciplinas, temLinhaBase, custoTotal },
    podeGerir,
    podeAprovar,
    podeExecutado,
    planoReal,
    cronograma,
    qualidade,
    pessoas,
  ] = await Promise.all([
    eapDoProjeto(projetoId, { verCusto }),
    can(user, "planejamento", "gerir"),
    can(user, "cronograma", "aprovar"),
    can(user, "cronograma", "executado"),
    planoVsRealProjeto(projetoId),
    cronogramaProjetoInfo(projetoId),
    qualidadeDoProjeto(projetoId),
    pessoasParaAtribuicao(),
  ]);

  return (
    <div className="space-y-6">
      <EapWorkspace
        projeto={projeto}
        tarefas={tarefas}
        disciplinas={disciplinas}
        pessoas={pessoas}
        temLinhaBase={temLinhaBase}
        custoTotal={custoTotal}
        podeGerir={podeGerir}
        podeAprovar={podeAprovar}
        podeExecutado={podeExecutado}
        cronograma={cronograma}
        qualidade={qualidade}
      />
      <PlanoVsReal dados={planoReal} />
    </div>
  );
}
