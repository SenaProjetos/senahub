import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarMaquinas, colaboradoresInternos, ativosSemMaquina } from "@/modules/patrimonio/queries";
import { TiView } from "@/components/patrimonio/ti-view";
import { PendenciasCicloTi } from "@/components/rh/pendencias-ciclo-ti";
import { pendenciasPorResponsavel } from "@/modules/rh/ciclo/queries";

export const metadata: Metadata = { title: "Gerenciamento de TI" };

export default async function TiPage() {
  // Submódulo de TI: gateado à permissão `patrimonio:ti` (papel `ti` + admin/supervisor).
  const user = await requirePermission("patrimonio", "ti");
  const [maquinas, colaboradores, ativos, pendencias] = await Promise.all([
    listarMaquinas(),
    colaboradoresInternos(),
    ativosSemMaquina(),
    // Entrada e saída (F4): os itens da TI são marcados aqui.
    pendenciasPorResponsavel(),
  ]);
  return (
    <TiView
      maquinas={maquinas}
      colaboradores={colaboradores}
      ativosSemMaquina={ativos}
      podeTi
      pendenciasSlot={<PendenciasCicloTi itens={pendencias.ti} quemId={user.id} />}
    />
  );
}
