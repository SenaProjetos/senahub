import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listarModelos } from "@/modules/planejamento/modelos/service";
import { ModelosView } from "@/components/planejamento/modelos/modelos-view";

export const metadata: Metadata = { title: "Modelos de EAP" };

export default async function ModelosEapPage() {
  const user = await requirePermission("planejamento", "ver");
  const [podeGerir, modelos, tipos] = await Promise.all([
    can(user, "planejamento", "gerir"),
    listarModelos(),
    prisma.tipoEmpreendimento.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    }),
  ]);

  return <ModelosView modelos={modelos} tiposEmpreendimento={tipos} podeGerir={podeGerir} />;
}
