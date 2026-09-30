import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { podeVerFinanceiro } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { podeVerDatasDoPlanejamento } from "@/modules/planejamento/acesso";
import { resultadosDoProjeto } from "@/modules/projetos/resultados/queries";
import { ResultadosView } from "@/components/projetos/resultados-view";

export const metadata: Metadata = { title: "Resultados — projeto" };

export default async function ResultadosProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  // Mesmo público de quem vê o cronograma com datas (`podeVerDatasDoPlanejamento`): as horas previstas são do
  // cronograma e o apontado é o ponto da equipe. O layout esconde a aba pela mesma regra; aqui a URL também fecha.
  const user = await requirePermission("projetos", "ver");
  if (!(await podeVerDatasDoPlanejamento(user))) notFound();
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  // R$ só para quem vê o financeiro: o custo/hora é a remuneração das pessoas.
  const dados = await resultadosDoProjeto(id, { verCusto: await podeVerFinanceiro(user) });
  return <ResultadosView projetoId={id} dados={dados} />;
}
