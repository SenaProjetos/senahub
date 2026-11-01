import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { podeVerCusto } from "@/lib/custo-visivel";
import { situacaoDosMeses } from "@/modules/rh/rateio/fechamento/queries";
import { RateioMesesView } from "@/components/rh/rateio/rateio-meses-view";

export const metadata: Metadata = { title: "Rateio de horas" };

export default async function RateioHorasPage() {
  const user = await requirePermission("ponto", "rateio");
  const verCusto = await podeVerCusto(user);
  const meses = await situacaoDosMeses({ podeVerCusto: verCusto });
  // Ver os meses é `ponto:rateio`; fechar, reabrir e recalcular é gestão de RH (o gate das ações).
  return <RateioMesesView meses={meses} podeGerir={user.gereRh} podeVerCusto={verCusto} />;
}
