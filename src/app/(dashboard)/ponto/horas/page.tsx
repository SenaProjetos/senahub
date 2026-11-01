import type { Metadata } from "next";
import { requireInterno } from "@/lib/session";
import { can } from "@/lib/permissions";
import { diaLocal } from "@/modules/ponto/engine";
import { resolverPeriodo } from "@/modules/rh/produtividade/periodo";
import { horasProjetistas } from "@/modules/rh/produtividade/queries";
import { usuariosParaEscala } from "@/modules/rh/escalas/queries";
import { MinhasHorasView } from "@/components/ponto/minhas-horas-view";
import { PontoSubnav } from "@/components/ponto/ponto-subnav";

export const metadata: Metadata = { title: "Minhas horas" };

/**
 * As horas de quem está logado. Quem vê o espelho da equipe (`ponto:espelho_equipe`) escolhe outra
 * pessoa por `?u=` (decisão do dono, 2026-10-22 — antes a tela não aceitava `?u=`); os demais
 * sempre veem as próprias, mesmo com `?u=` na URL.
 */
export default async function MinhasHorasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; u?: string }>;
}) {
  const user = await requireInterno();
  const sp = await searchParams;
  const hoje = diaLocal(new Date());
  const periodo = resolverPeriodo({ de: sp.de, ate: sp.ate }, hoje);
  const podeVerEquipe = await can(user, "ponto", "espelho_equipe");
  const targetId = podeVerEquipe && sp.u ? sp.u : user.id;
  const [horas, usuarios] = await Promise.all([
    horasProjetistas(periodo, { userIds: [targetId] }),
    podeVerEquipe ? usuariosParaEscala() : Promise.resolve(null),
  ]);
  return (
    <MinhasHorasView
      subnav={<PontoSubnav />}
      horas={horas}
      periodo={periodo}
      hoje={hoje}
      usuarios={usuarios ? usuarios.map((u) => ({ id: u.id, name: u.name })) : null}
      usuarioSelecionadoId={targetId}
      souEuMesmo={targetId === user.id}
    />
  );
}
