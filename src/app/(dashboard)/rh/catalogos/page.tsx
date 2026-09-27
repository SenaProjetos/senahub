import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { catalogosAdmin } from "@/modules/rh/catalogos/queries";
import { CatalogosView } from "@/components/rh/catalogos-view";

export const metadata: Metadata = { title: "Cargos e departamentos" };

export default async function CatalogosPage() {
  // Gate por PERMISSÃO, não por role: `administrativo` recebe `rh:catalogos` no seed e precisa
  // alcançar a tela — um requireRole("admin","supervisor") o deixaria de fora.
  const user = await requirePermission("rh", "catalogos");
  const [catalogos, podeAbrirFicha] = await Promise.all([catalogosAdmin(), can(user, "rh", "cadastro")]);

  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Cargos e departamentos" descricao="As listas do cadastro das pessoas. Abra uma linha para ver quem ocupa cada cargo e departamento." />
      <CatalogosView catalogos={catalogos} podeAbrirFicha={podeAbrirFicha} />
    </div>
  );
}
