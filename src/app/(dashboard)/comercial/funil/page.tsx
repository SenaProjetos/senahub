import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Download, KanbanSquare } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  campanhasAtivas,
  canaisAtivos,
  clientesParaSelecao,
  funilComercial,
  motivosPerdaAtivos,
  opcoesFiltroComercial,
  parceirosAtivos,
} from "@/modules/comercial/queries";
import { lerFiltros } from "@/modules/comercial/filtros";
import {
  COLUNAS_FUNIL_LEAD,
  COOKIE_COLUNAS_FECHADAS,
  lerColunasFechadas,
} from "@/modules/comercial/funil";
import { ESTAGIOS_ATIVOS } from "@/modules/comercial/jornada";
import { FiltrosComerciais } from "@/components/comercial/filtros-comerciais";
import { FunilComercialBoard } from "@/components/comercial/funil-comercial-board";
import { ProspeccaoRapidaDialog } from "@/components/comercial/prospeccao-rapida-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { brlInteiro } from "@/lib/utils";

export const metadata: Metadata = { title: "Funil comercial" };

/** searchParams → query string, repassada como está aos exports CSV (a URL é a fonte do filtro). */
function paraQueryString(sp: Record<string, string | string[] | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    p.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
  }
  return p.toString();
}

/** Board único de Prospecção + Negociação (ADR-0004) — substitui `/prospeccao` e `/negociacoes`. */
export default async function FunilComercialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user, "comercial", "gerir");
  const sp = await searchParams;
  const filtros = lerFiltros(sp);
  const pagina = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const alvoId = (Array.isArray(sp.negociacao) ? sp.negociacao[0] : sp.negociacao) ?? null;
  const fechadas = lerColunasFechadas((await cookies()).get(COOKIE_COLUNAS_FECHADAS)?.value);

  const [colunas, motivos, opcoes, campanhas, canais, parceiros, clientes] = await Promise.all([
    funilComercial({ filtros, pagina, alvoId, fechadas }),
    motivosPerdaAtivos(),
    opcoesFiltroComercial(),
    campanhasAtivas(),
    canaisAtivos(),
    parceirosAtivos(),
    // Só quem pode gerir abre a entrada comercial — sem o gate, até 500 nomes de clientes iriam
    // no payload de quem só tem `comercial:ver`.
    podeGerir ? clientesParaSelecao() : [],
  ]);
  const qs = paraQueryString(sp);

  const soma = (filtro: (c: (typeof colunas)[number]) => boolean, campo: "total" | "soma") =>
    colunas.filter(filtro).reduce((s, c) => s + c[campo], 0);
  const emProspeccao = soma((c) => (COLUNAS_FUNIL_LEAD as readonly string[]).includes(c.coluna), "total");
  const abertas = (c: (typeof colunas)[number]) => (ESTAGIOS_ATIVOS as readonly string[]).includes(c.coluna);
  const emNegociacao = soma(abertas, "total");
  const pipeline = soma(abertas, "soma");
  const total = colunas.reduce((s, c) => s + c.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">Funil comercial</h2>
          <p className="text-sm text-muted-foreground">
            {emProspeccao} em prospecção · {emNegociacao} em negociação · pipeline em aberto{" "}
            {brlInteiro(pipeline)} · arraste para mudar de etapa
          </p>
        </div>
        {podeGerir && (
          <>
            <Button variant="outline" size="sm" render={<a href={`/api/comercial/export/prospeccoes?${qs}`} />}>
              <Download className="size-4" /> Prospecções
            </Button>
            <Button variant="outline" size="sm" render={<a href={`/api/comercial/export/negociacoes?${qs}`} />}>
              <Download className="size-4" /> Negociações
            </Button>
            <Button variant="outline" size="sm" render={<a href={`/api/comercial/export/contatos?${qs}`} />}>
              <Download className="size-4" /> Contatos
            </Button>
            <ProspeccaoRapidaDialog
              campanhas={campanhas}
              canais={canais}
              parceiros={parceiros}
              clientes={clientes}
            />
          </>
        )}
      </div>

      <FiltrosComerciais opcoes={opcoes} mostrarDisciplina />
      {filtros.disciplinaId && (
        <p className="text-xs text-muted-foreground">
          Filtrando por disciplina: prospecções não têm disciplina e ficam ocultas.
        </p>
      )}

      {total === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="Funil vazio"
          description="Registre uma nova entrada comercial para começar."
        />
      ) : (
        <FunilComercialBoard colunas={colunas} motivos={motivos} pagina={pagina} />
      )}
    </div>
  );
}
