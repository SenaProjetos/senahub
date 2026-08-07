import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { catalogosAdmin } from "@/modules/rh/catalogos/queries";
import { CatalogosView } from "@/components/rh/catalogos-view";

export const metadata: Metadata = { title: "Cargos e departamentos" };

export default async function CatalogosPage() {
  // Gate por PERMISSÃO, não por role: `administrativo` recebe `rh:catalogos` no seed e precisa
  // alcançar a tela — um requireRole("admin","supervisor") o deixaria de fora.
  await requirePermission("rh", "catalogos");
  const catalogos = await catalogosAdmin();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Cargos e departamentos</h1>
        <p className="text-sm text-muted-foreground">
          As listas que aparecem no cadastro das pessoas. Item em uso não pode ser excluído — arquive-o.
        </p>
      </div>
      <CatalogosView catalogos={catalogos} />
    </div>
  );
}
