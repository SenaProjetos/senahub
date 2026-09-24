import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { matrizRecursos, cargaSemanalPorRecurso } from "@/modules/planejamento/queries";
import { cargaDaEquipe } from "@/modules/planejamento/recursos-queries";
import { listarHabilidades, habilidadesDeUsuarios } from "@/modules/rh/habilidades/queries";
import { RecursosMatrix } from "@/components/recursos/recursos-matrix";

export const metadata: Metadata = { title: "Recursos" };

export default async function RecursosPage() {
  const user = await requirePermission("recursos", "ver");
  const [{ linhas, projetos, usuariosSemRecurso }, podeGerir, catalogoHabilidades, cargaSemanal, cargaPlanejada] =
    await Promise.all([
      matrizRecursos(),
      can(user, "recursos", "gerir"),
      listarHabilidades(),
      cargaSemanalPorRecurso(12),
      // F5: carga PLANEJADA das linhas de EAP (projetos com cronograma aprovado), com as
      // sobrecargas e as sugestões já verificadas. `matrizRecursos` chama esta mesma função
      // por dentro para 1 semana e sem sugestões — duas chamadas de propósito: aquela
      // alimenta os totais da matriz, esta as 12 semanas e o que fazer com o excesso.
      cargaDaEquipe({ semanas: 12 }),
    ]);
  const habilidadesPorUser = await habilidadesDeUsuarios(linhas.map((l) => l.userId));

  return (
    <RecursosMatrix
      linhas={linhas}
      projetos={projetos}
      usuariosSemRecurso={usuariosSemRecurso}
      podeGerir={podeGerir}
      catalogoHabilidades={catalogoHabilidades}
      habilidadesPorUser={habilidadesPorUser}
      cargaSemanal={cargaSemanal}
      cargaPlanejada={cargaPlanejada}
    />
  );
}
