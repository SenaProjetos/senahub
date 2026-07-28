"use client";

import Link from "next/link";
import { Calculator } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatarData } from "@/lib/utils";
import type { OrcamentoListItem } from "@/modules/custos/queries";
import { STATUS_ORCAMENTO_LABEL, STATUS_ORCAMENTO_TONE } from "@/modules/custos/status";
import { NovoOrcamentoDialog } from "./novo-orcamento-dialog";

export function ProjetoCustosView({
  projeto,
  itens,
  podeGerir,
}: {
  projeto: { id: string; codigo: string; nome: string };
  itens: OrcamentoListItem[];
  podeGerir: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Orçamentos de custo</h3>
          <p className="text-sm text-muted-foreground">{itens.length} orçamento(s) deste projeto.</p>
        </div>
        {podeGerir && <NovoOrcamentoDialog projetoFixo={projeto} />}
      </div>

      {itens.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="Nenhum orçamento de custo ainda."
          description={podeGerir ? 'Clique em "Novo orçamento" para começar.' : undefined}
        />
      ) : (
        <div className="rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Data-base</TableHead>
                <TableHead className="text-right">BDI</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    <Link href={`/custos/${o.id}`} className="hover:underline">
                      {o.titulo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatarData(o.dataBase)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {o.bdiPercentual != null ? `${o.bdiPercentual.toFixed(2)}%` : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_ORCAMENTO_TONE[o.status] ?? "neutral"}>
                      {STATUS_ORCAMENTO_LABEL[o.status] ?? o.status}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
