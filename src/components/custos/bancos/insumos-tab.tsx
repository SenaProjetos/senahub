"use client";

import { useState } from "react";
import { Search, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSetParams } from "@/lib/use-set-param";
import type { InsumoListItem } from "@/modules/custos/composicoes/queries";

const CATEGORIA_LABEL: Record<string, string> = {
  servicos: "Serviços",
  material: "Material",
  mao_de_obra: "Mão de obra",
  encargos_complementares: "Encargos complementares",
  equipamento: "Equipamento",
  especiais: "Especiais",
};

export function InsumosTab({
  itens,
  total,
  page,
  pageSize,
  pageCount,
  q,
}: {
  itens: InsumoListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  q: string;
}) {
  const setParams = useSetParams();
  const [busca, setBusca] = useState(q);

  return (
    <div className="space-y-3 pt-3">
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

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Fonte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState icon={Package} title="Nenhum insumo encontrado." />
                </TableCell>
              </TableRow>
            ) : (
              itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-sm">{i.codigo}</TableCell>
                  <TableCell>{i.descricao}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{i.unidade}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{CATEGORIA_LABEL[i.categoria] ?? i.categoria}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground uppercase">{i.fonte}</TableCell>
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
