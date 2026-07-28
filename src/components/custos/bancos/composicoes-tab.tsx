"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSetParams } from "@/lib/use-set-param";
import type { ComposicaoListItem } from "@/modules/custos/composicoes/queries";
import { NovaComposicaoDialog } from "./nova-composicao-dialog";

export function ComposicoesTab({
  itens,
  total,
  page,
  pageSize,
  pageCount,
  q,
  podeGerir,
}: {
  itens: ComposicaoListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  q: string;
  podeGerir: boolean;
}) {
  const setParams = useSetParams();
  const [busca, setBusca] = useState(q);

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            placeholder="Buscar por código ou descrição…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setParams({ q: busca || null, page: null })}
          />
          <Button variant="outline" size="icon" aria-label="Buscar" onClick={() => setParams({ q: busca || null, page: null })}>
            <Search className="size-4" />
          </Button>
        </div>
        {podeGerir && <NovaComposicaoDialog />}
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Fonte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={Layers}
                    title="Nenhuma composição encontrada."
                    description={podeGerir ? 'Clique em "Nova composição" para começar.' : undefined}
                  />
                </TableCell>
              </TableRow>
            ) : (
              itens.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">
                    <Link href={`/custos/composicoes/${c.id}`} className="hover:underline">
                      {c.codigo}
                    </Link>
                  </TableCell>
                  <TableCell>{c.descricao}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.unidade}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.grupo ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground uppercase">{c.fonte}</TableCell>
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
