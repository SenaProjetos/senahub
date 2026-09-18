import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { followUpsComerciais } from "@/modules/comercial/queries";
import { AlternanciaVisaoComercial } from "@/components/comercial/alternancia-visao-comercial";
import { FollowUpsView } from "@/components/comercial/follow-ups-view";

export const metadata: Metadata = { title: "Follow-ups" };

/** Agenda dos follow-ups comerciais — todas as próximas ações em aberto, por urgência. */
export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("comercial", "ver");
  const sp = await searchParams;
  const meus = (Array.isArray(sp.visao) ? sp.visao[0] : sp.visao) === "meus";
  const { itens, truncado } = await followUpsComerciais({ responsavelId: meus ? user.id : undefined });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Follow-ups</h2>
        <p className="text-sm text-muted-foreground">
          {itens.length} ação(ões) em aberto · elas também aparecem na Agenda de quem as agendou e do
          responsável
        </p>
      </div>
      <AlternanciaVisaoComercial meus={meus} />
      <FollowUpsView itens={itens} truncado={truncado} />
    </div>
  );
}
