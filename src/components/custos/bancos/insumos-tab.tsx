"use client";

import { Fragment, useState } from "react";
import { Search, Package, ChevronRight, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSetParams } from "@/lib/use-set-param";
import { formatarData } from "@/lib/utils";
import type { InsumoListItem } from "@/modules/custos/composicoes/queries";
import { buscarHistoricoPrecoInsumo } from "@/modules/custos/cotacoes/actions";
import type { HistoricoPrecoItem } from "@/modules/custos/cotacoes/queries";

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
  podeCotacao,
}: {
  itens: InsumoListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  q: string;
  podeCotacao: boolean;
}) {
  const setParams = useSetParams();
  const [busca, setBusca] = useState(q);
  const [aberto, setAberto] = useState<string | null>(null);
  const [historico, setHistorico] = useState<Record<string, HistoricoPrecoItem[]>>({});

  async function alternar(id: string) {
    if (aberto === id) {
      setAberto(null);
      return;
    }
    setAberto(id);
    if (!historico[id]) {
      const r = await buscarHistoricoPrecoInsumo({ insumoId: id });
      if (r.ok) setHistorico((h) => ({ ...h, [id]: r.data }));
    }
  }

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
              {podeCotacao && <TableHead className="w-8" />}
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
                <TableCell colSpan={podeCotacao ? 6 : 5} className="p-0">
                  <EmptyState icon={Package} title="Nenhum insumo encontrado." />
                </TableCell>
              </TableRow>
            ) : (
              itens.map((i) => (
                <Fragment key={i.id}>
                  <TableRow
                    className={podeCotacao ? "cursor-pointer" : undefined}
                    onClick={podeCotacao ? () => alternar(i.id) : undefined}
                  >
                    {podeCotacao && (
                      <TableCell className="text-muted-foreground">
                        {aberto === i.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-sm">{i.codigo}</TableCell>
                    <TableCell>{i.descricao}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.unidade}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{CATEGORIA_LABEL[i.categoria] ?? i.categoria}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground uppercase">{i.fonte}</TableCell>
                  </TableRow>
                  {podeCotacao && aberto === i.id && (
                    <TableRow key={`${i.id}-hist`}>
                      <TableCell colSpan={6} className="bg-muted/30 p-3">
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">Histórico de preço (cotações vencedoras)</p>
                        {!historico[i.id] ? (
                          <p className="text-xs text-muted-foreground">Carregando…</p>
                        ) : historico[i.id].length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nenhum preço histórico ainda — vence uma RFQ com este insumo pra começar.</p>
                        ) : (
                          <ul className="space-y-0.5 text-xs">
                            {historico[i.id].map((h) => (
                              <li key={h.id} className="flex items-center gap-2">
                                <span className="font-mono">{h.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                                <span className="text-muted-foreground">
                                  {h.fornecedorNome ?? "—"} · {formatarData(h.data)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />
    </div>
  );
}
