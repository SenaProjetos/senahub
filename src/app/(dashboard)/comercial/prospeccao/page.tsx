import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { funilProspeccao, opcoesFiltroComercial } from "@/modules/comercial/queries";
import { lerFiltros } from "@/modules/comercial/filtros";
import { FiltrosComerciais } from "@/components/comercial/filtros-comerciais";
import { ProspeccaoBoard, ProspeccaoVazia } from "@/components/comercial/prospeccao-board";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Prospecção" };

/**
 * Kanban de Prospecção (F2.13), agrupado por `StatusProspeccao`.
 *
 * Rota própria, e não substituição do `/comercial`, porque o board antigo ainda é o único que
 * enxerga `FunilEtapa` — e os 8 leads de produção só migram para o funil novo na **F2.18**. Trocar
 * agora deixaria a operação sem board até lá. Os dois convivem no intervalo, de propósito.
 */
export default async function ProspeccaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("comercial", "ver");
  const filtros = lerFiltros(await searchParams);
  const [colunas, opcoes] = await Promise.all([
    funilProspeccao(filtros),
    opcoesFiltroComercial(),
  ]);
  const total = colunas.reduce((s, c) => s + c.leads.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/comercial" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">Prospecção</h2>
          <p className="text-sm text-muted-foreground">
            {total} prospecção(ões) no funil · arraste para mudar de estágio
          </p>
        </div>
      </div>

      <FiltrosComerciais opcoes={opcoes} />

      {total === 0 ? <ProspeccaoVazia /> : <ProspeccaoBoard colunas={colunas} />}
    </div>
  );
}
