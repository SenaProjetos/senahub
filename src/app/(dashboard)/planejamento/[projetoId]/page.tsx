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
import { podeVerDatasDoPlanejamento } from "@/modules/planejamento/acesso";
import { EapWorkspace } from "@/components/planejamento/eap-workspace";
import { PlanoVsReal } from "@/components/planejamento/plano-vs-real";
import { ValorAgregadoPainel } from "@/components/planejamento/valor-agregado-painel";
import { valorAgregadoDoProjeto } from "@/modules/planejamento/valor-agregado-service";
import { previasDosModelos } from "@/modules/planejamento/modelos/service";
import { paraDia } from "@/modules/planejamento/agenda";
import { inicioDoDiaUtc } from "@/lib/data";

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
  // Decisão #3: quem só consulta vê a estrutura, sem datas — o servidor nem busca o que só existe por causa delas.
  const verDatas = await podeVerDatasDoPlanejamento(user);

  const [
    { tarefas, disciplinas, temLinhaBase, custoTotal, calendario },
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
    eapDoProjeto(projetoId, { verCusto, verDatas }),
    can(user, "planejamento", "gerir"),
    can(user, "cronograma", "aprovar"),
    can(user, "cronograma", "executado"),
    can(user, "aprovacoes", "disciplina"),
    planoVsRealProjeto(projetoId),
    verDatas ? cronogramaProjetoInfo(projetoId) : Promise.resolve(null),
    verDatas ? qualidadeDoProjeto(projetoId) : Promise.resolve(null),
    pessoasParaAtribuicao(),
    // F8: horas para quem coordena; R$ só para quem vê o financeiro (taxa de remuneração). Depende da Data
    // de Status, então também some para quem não vê datas.
    verDatas ? valorAgregadoDoProjeto(projetoId, { verCusto }) : Promise.resolve(null),
  ]);

  // Decisão #5: o seletor de modelo só aparece com a EAP vazia e para quem monta — e a prévia (quantas
  // linhas cada modelo criaria AQUI) é calculada num passe só, com o contexto do projeto lido uma vez.
  const previasModelos = podeGerir && tarefas.length === 0 ? await previasDosModelos(projetoId) : [];

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
        verDatas={verDatas}
        calendario={calendario}
        hoje={paraDia(inicioDoDiaUtc())}
        cronograma={cronograma}
        qualidade={qualidade}
        previasModelos={previasModelos}
      />
      {valorAgregado && <ValorAgregadoPainel dados={valorAgregado} />}
      <PlanoVsReal dados={planoReal} />
    </div>
  );
}
