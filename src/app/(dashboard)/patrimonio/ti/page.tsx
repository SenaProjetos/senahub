import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarMaquinas, colaboradoresInternos, ativosSemMaquina } from "@/modules/patrimonio/queries";
import { TiView } from "@/components/patrimonio/ti-view";

export const metadata: Metadata = { title: "Gerenciamento de TI" };

export default async function TiPage() {
  // Submódulo de TI: gateado à permissão `patrimonio:ti` (papel `ti` + admin/supervisor).
  await requirePermission("patrimonio", "ti");
  const [maquinas, colaboradores, ativos] = await Promise.all([
    listarMaquinas(),
    colaboradoresInternos(),
    ativosSemMaquina(),
  ]);
  return <TiView maquinas={maquinas} colaboradores={colaboradores} ativosSemMaquina={ativos} podeTi />;
}
