import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import {
  funilNegociacao,
  motivosPerdaAtivos,
  opcoesFiltroComercial,
} from "@/modules/comercial/queries";
import { lerFiltros } from "@/modules/comercial/filtros";
import { FiltrosComerciais } from "@/components/comercial/filtros-comerciais";
import { NegociacaoBoard } from "@/components/comercial/negociacao-board";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Handshake } from "lucide-react";
import { brlInteiro } from "@/lib/utils";

export const metadata: Metadata = { title: "Negociações" };

/** Kanban de Negociações (F2.14) — o funil que hoje acontece inteiramente fora do sistema. */
export default async function NegociacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("comercial", "ver");
  const filtros = lerFiltros(await searchParams);
  const [colunas, motivos, opcoes] = await Promise.all([
    funilNegociacao({ filtros }),
    motivosPerdaAtivos(),
    opcoesFiltroComercial(),
  ]);

  const total = colunas.reduce((s, c) => s + c.total, 0);
  // Pipeline = só o que ainda pode fechar. Contratado já fechou; perdido/cancelado não volta
  // sozinho — somar tudo daria um número grande e sem significado nenhum.
  const emAberto = colunas.filter((c) =>
    ["LEVANTAMENTO", "ORCAMENTO", "PROPOSTA_ENVIADA", "NEGOCIACAO"].includes(c.estagio),
  );
  const pipeline = emAberto.reduce((s, c) => s + c.soma, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/comercial" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">Negociações</h2>
          <p className="text-sm text-muted-foreground">
            {total} negociação(ões) · pipeline em aberto {brlInteiro(pipeline)}
          </p>
        </div>
      </div>

      <FiltrosComerciais opcoes={opcoes} mostrarDisciplina />

      {total === 0 ? (
        <EmptyState
          icon={Handshake}
          title="Nenhuma negociação"
          description="Qualifique uma prospecção para criar a primeira."
        />
      ) : (
        <NegociacaoBoard colunas={colunas} motivos={motivos} />
      )}
    </div>
  );
}
