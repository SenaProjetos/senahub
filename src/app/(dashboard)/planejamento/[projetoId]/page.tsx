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
import { ValorAgregadoPainel } from "@/components/planejamento/valor-agregado-painel";
import { valorAgregadoDoProjeto } from "@/modules/planejamento/valor-agregado-service";

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
    podeAprovarFase,
    planoReal,
    cronograma,
    qualidade,
    pessoas,
    valorAgregado,
  ] = await Promise.all([
    eapDoProjeto(projetoId, { verCusto }),
    can(user, "planejamento", "gerir"),
    can(user, "cronograma", "aprovar"),
    can(user, "cronograma", "executado"),
    can(user, "aprovacoes", "disciplina"),
    planoVsRealProjeto(projetoId),
    cronogramaProjetoInfo(projetoId),
    qualidadeDoProjeto(projetoId),
    pessoasParaAtribuicao(),
    // F8: horas para quem coordena; R$ só para quem vê o financeiro (taxa de remuneração).
    valorAgregadoDoProjeto(projetoId, { verCusto }),
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
        podeAprovarFase={podeAprovarFase}
        cronograma={cronograma}
        qualidade={qualidade}
      />
      <ValorAgregadoPainel dados={valorAgregado} />
      <PlanoVsReal dados={planoReal} />
    </div>
  );
}
