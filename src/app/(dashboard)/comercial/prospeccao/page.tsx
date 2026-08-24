import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  campanhasAtivas,
  canaisAtivos,
  funilProspeccao,
  opcoesFiltroComercial,
  parceirosAtivos,
} from "@/modules/comercial/queries";
import { lerFiltros } from "@/modules/comercial/filtros";
import { FiltrosComerciais } from "@/components/comercial/filtros-comerciais";
import { ProspeccaoBoard, ProspeccaoVazia } from "@/components/comercial/prospeccao-board";
import { ProspeccaoRapidaDialog } from "@/components/comercial/prospeccao-rapida-dialog";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Prospecção" };

/** searchParams (Next) → query string — mesmas chaves repassadas pro export CSV (F4.6), sem
 *  reconstruir o filtro a partir de `FiltrosComerciais` (a URL já É a fonte de verdade). */
function paraQueryString(sp: Record<string, string | string[] | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    p.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
  }
  return p.toString();
}

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
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user, "comercial", "gerir");
  const sp = await searchParams;
  const filtros = lerFiltros(sp);
  const pagina = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const [colunas, opcoes, campanhas, canais, parceiros] = await Promise.all([
    funilProspeccao({ filtros, pagina }),
    opcoesFiltroComercial(),
    campanhasAtivas(),
    canaisAtivos(),
    parceirosAtivos(),
  ]);
  const total = colunas.reduce((s, c) => s + c.total, 0);
  const qs = paraQueryString(sp);

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
        {podeGerir && (
          <>
            <Button variant="outline" size="sm" render={<a href={`/api/comercial/export/prospeccoes?${qs}`} />}>
              <Download className="size-4" /> Prospecções
            </Button>
            <Button variant="outline" size="sm" render={<a href={`/api/comercial/export/contatos?${qs}`} />}>
              <Download className="size-4" /> Contatos
            </Button>
            <ProspeccaoRapidaDialog campanhas={campanhas} canais={canais} parceiros={parceiros} />
          </>
        )}
      </div>

      <FiltrosComerciais opcoes={opcoes} />

      {total === 0 ? <ProspeccaoVazia /> : <ProspeccaoBoard colunas={colunas} pagina={pagina} />}
    </div>
  );
}
