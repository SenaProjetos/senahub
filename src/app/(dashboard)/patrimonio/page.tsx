import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarAtivos, categoriasAtivo, colaboradoresInternos } from "@/modules/patrimonio/queries";
import { PatrimonioView } from "@/components/patrimonio/patrimonio-view";

export const metadata: Metadata = { title: "Patrimônio" };

export default async function PatrimonioPage() {
  const user = await requirePermission("patrimonio", "ver");
  const [ativos, categorias, colaboradores, podeGerir] = await Promise.all([
    listarAtivos(),
    categoriasAtivo(),
    colaboradoresInternos(),
    can(user.role, "patrimonio", "gerir"),
  ]);
  return (
    <PatrimonioView ativos={ativos} categorias={categorias} colaboradores={colaboradores} podeGerir={podeGerir} />
  );
}
