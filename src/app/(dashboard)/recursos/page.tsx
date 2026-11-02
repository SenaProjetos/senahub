import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { matrizRecursos, cargaSemanalPorRecurso } from "@/modules/planejamento/queries";
import { cargaDaEquipe } from "@/modules/planejamento/recursos-queries";
import { RecursosMatrix } from "@/components/recursos/recursos-matrix";

export const metadata: Metadata = { title: "Recursos" };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export default async function RecursosPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const user = await requirePermission("recursos", "ver");
  // `?de=&ate=` chega pelo aviso de ausência que afeta alocação: abre o mapa já nessa janela.
  const { de, ate } = await searchParams;
  const janelaInicial = de && ate && DIA.test(de) && DIA.test(ate) && de <= ate ? { de, ate } : null;
  // Custo/hora é dado do financeiro (decisão do time, 2026-09-25): vê quem vê o financeiro, edita quem o gere.
  const verCusto = await podeVerFinanceiro(user);
  const editarCusto = verCusto && (await can(user, "financeiro", "gerir"));
  const [{ linhas, projetos, usuariosSemRecurso }, podeGerir, cargaSemanal, cargaPlanejada] = await Promise.all([
    matrizRecursos({ verCusto }),
    can(user, "recursos", "gerir"),
    cargaSemanalPorRecurso(12),
    // F5: carga PLANEJADA das linhas de EAP (projetos com cronograma aprovado), com as sobrecargas.
    // `matrizRecursos` chama esta mesma função por dentro para 1 semana — duas chamadas de propósito:
    // aquela alimenta os totais da matriz, esta as 12 semanas. `incluirDigitada: false`: a tela é só
    // leitura das EAPs (Lote 2) — a alocação digitada não aparece nem soma.
    cargaDaEquipe({ semanas: 12, incluirDigitada: false }),
  ]);

  return (
    <RecursosMatrix
      linhas={linhas}
      projetos={projetos}
      usuariosSemRecurso={usuariosSemRecurso}
      podeGerir={podeGerir}
      verCusto={verCusto}
      editarCusto={editarCusto}
      cargaSemanal={cargaSemanal}
      cargaPlanejada={cargaPlanejada}
      janelaInicial={janelaInicial}
    />
  );
}
