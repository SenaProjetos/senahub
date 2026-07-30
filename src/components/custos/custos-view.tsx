"use client";

import { useState } from "react";
import Link from "next/link";
import { Calculator, Search, Database, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SortableHead } from "@/components/ui/sortable-head";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSetParams } from "@/lib/use-set-param";
import { formatarData } from "@/lib/utils";
import type { OrcamentoListItem } from "@/modules/custos/queries";
import { STATUS_ORCAMENTO_LABEL, STATUS_ORCAMENTO_TONE } from "@/modules/custos/status";
import { NovoOrcamentoDialog } from "./novo-orcamento-dialog";

const TODOS = "todos";

export function CustosView({
  itens,
  total,
  page,
  pageCount,
  pageSize,
  q,
  status,
  podeGerir,
  podeBancos,
  podeCotacao,
}: {
  itens: OrcamentoListItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  status: string;
  podeGerir: boolean;
  podeBancos: boolean;
  podeCotacao: boolean;
}) {
  const setParams = useSetParams();
  const [busca, setBusca] = useState(q);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Engenharia de Custos</h2>
          <p className="text-sm text-muted-foreground">{total} orçamento(s).</p>
        </div>
        <div className="flex items-center gap-2">
          {podeBancos && (
            <Button variant="outline" render={<Link href="/custos/bancos" />}>
              <Database className="size-4" /> Bancos
            </Button>
          )}
          {podeCotacao && (
            <Button variant="outline" render={<Link href="/custos/cotacoes" />}>
              <ClipboardList className="size-4" /> Cotações
            </Button>
          )}
          {podeGerir && <NovoOrcamentoDialog />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            placeholder="Buscar por título, projeto ou nome avulso…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setParams({ q: busca || null })}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Buscar"
            onClick={() => setParams({ q: busca || null })}
          >
            <Search className="size-4" />
          </Button>
        </div>
        <Select value={status || TODOS} onValueChange={(v) => setParams({ status: v === TODOS ? null : v })}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Status: todos</SelectItem>
            {Object.entries(STATUS_ORCAMENTO_LABEL).map(([v, label]) => (
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
              <TableHead>Projeto / Avulso</TableHead>
              <SortableHead field="dataBase">Data-base</SortableHead>
              <TableHead className="text-right">BDI</TableHead>
              <SortableHead field="status">Status</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={Calculator}
                    title="Nenhum orçamento encontrado."
                    description={podeGerir ? 'Clique em "Novo orçamento" para começar.' : undefined}
                  />
                </TableCell>
              </TableRow>
            ) : (
              itens.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    <Link href={`/custos/${o.id}`} className="hover:underline">
                      {o.titulo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {o.projetoId ? `${o.projetoCodigo} — ${o.projetoNome}` : `Avulso: ${o.nomeAvulso}`}
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />
    </div>
  );
}
