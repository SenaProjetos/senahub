"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SortableHead } from "@/components/ui/sortable-head";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSetParams } from "@/lib/use-set-param";
import { formatarData } from "@/lib/utils";
import type { RfqListItem } from "@/modules/custos/cotacoes/queries";
import { STATUS_RFQ_LABEL, STATUS_RFQ_TONE } from "@/modules/custos/cotacoes/status";
import { NovaRfqDialog } from "./nova-rfq-dialog";

const TODOS = "todos";

export function CotacoesView({
  itens,
  total,
  page,
  pageCount,
  pageSize,
  q,
  status,
}: {
  itens: RfqListItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  status: string;
}) {
  const setParams = useSetParams();
  const [busca, setBusca] = useState(q);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Cotações (RFQ)</h2>
          <p className="text-sm text-muted-foreground">{total} solicitação(ões) de cotação.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" render={<Link href="/custos" />}>
            Voltar
          </Button>
          <NovaRfqDialog />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            placeholder="Buscar por título…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setParams({ q: busca || null })}
          />
          <Button variant="outline" size="icon" aria-label="Buscar" onClick={() => setParams({ q: busca || null })}>
            <Search className="size-4" />
          </Button>
        </div>
        <Select value={status || TODOS} onValueChange={(v) => setParams({ status: v === TODOS ? null : v })}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Status: todos</SelectItem>
            {Object.entries(STATUS_RFQ_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead field="titulo">Título</SortableHead>
              <TableHead>Obra</TableHead>
              <SortableHead field="prazoResposta">Prazo</SortableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Propostas</TableHead>
              <SortableHead field="status">Status</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState icon={ClipboardList} title="Nenhuma RFQ encontrada." description='Clique em "Nova RFQ" para começar.' />
                </TableCell>
              </TableRow>
            ) : (
              itens.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link href={`/custos/cotacoes/${r.id}`} className="hover:underline">
                      {r.titulo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.orcamentoTitulo ?? "Avulsa"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.prazoResposta ? formatarData(r.prazoResposta) : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.totalItens}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.totalPropostas}</TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_RFQ_TONE[r.status] ?? "neutral"}>{STATUS_RFQ_LABEL[r.status] ?? r.status}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />
    </div>
  );
}
