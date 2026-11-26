import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { disciplinasDoCatalogo, parceirosExternos } from "@/modules/planejamento/parceiros/queries";
import { ParceirosView } from "@/components/recursos/parceiros-view";

export const metadata: Metadata = { title: "Parceiros externos" };

/**
 * Parceiros externos (pool de recursos, parte 6 — decisão 4): quem executa a etapa de terceiro fora da casa. Vê quem vê
 * Recursos; cadastra, edita e arquiva quem gere Recursos (`recursos:gerir`).
 */
export default async function ParceirosPage() {
  const user = await requirePermission("recursos", "ver");
  const podeGerir = user.tipo === "interno" && (await can(user, "recursos", "gerir"));
  const [parceiros, disciplinas] = await Promise.all([parceirosExternos(), podeGerir ? disciplinasDoCatalogo() : Promise.resolve([])]);
  return <ParceirosView parceiros={parceiros} disciplinas={disciplinas} podeGerir={podeGerir} />;
}
