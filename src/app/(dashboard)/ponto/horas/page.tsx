import type { Metadata } from "next";
import { requireInterno } from "@/lib/session";
import { diaLocal } from "@/modules/ponto/engine";
import { resolverPeriodo } from "@/modules/rh/produtividade/periodo";
import { horasProjetistas } from "@/modules/rh/produtividade/queries";
import { MinhasHorasView } from "@/components/ponto/minhas-horas-view";
import { PontoSubnav } from "@/components/ponto/ponto-subnav";

export const metadata: Metadata = { title: "Minhas horas" };

/** Sempre as horas de quem está logado — não aceita `?u=` (decisão do dono, 2026-10-07). */
export default async function MinhasHorasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireInterno();
  const sp = await searchParams;
  const hoje = diaLocal(new Date());
  const periodo = resolverPeriodo({ de: sp.de, ate: sp.ate }, hoje);
  const horas = await horasProjetistas(periodo, { userIds: [user.id] });
  return <MinhasHorasView subnav={<PontoSubnav />} horas={horas} periodo={periodo} hoje={hoje} />;
}
