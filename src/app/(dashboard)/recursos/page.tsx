import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { matrizRecursos } from "@/modules/planejamento/queries";
import { listarHabilidades, habilidadesDeUsuarios } from "@/modules/rh/habilidades/queries";
import { RecursosMatrix } from "@/components/recursos/recursos-matrix";

export const metadata: Metadata = { title: "Recursos" };

export default async function RecursosPage() {
  const user = await requirePermission("recursos", "ver");
  const [{ linhas, projetos, usuariosSemRecurso }, podeGerir, catalogoHabilidades] = await Promise.all([
    matrizRecursos(),
    can(user.role, "recursos", "gerir"),
    listarHabilidades(),
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
    />
  );
}
