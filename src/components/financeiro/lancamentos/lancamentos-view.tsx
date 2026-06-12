"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Check, Ban, Trash2 } from "lucide-react";
import { cancelarLancamento, excluirLancamento } from "@/modules/financeiro/lancamentos/actions";
import type { LancamentoItem, OpcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { LancamentoForm } from "./lancamento-form";
import { ConfirmarDialog } from "./confirmar-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dt(d: string | Date | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "—";
}

const STATUS_CHIP: Record<string, string> = {
  previsto: "text-warning border-warning/40",
  confirmado: "text-success border-success/40",
  cancelado: "text-muted-foreground",
};

export function LancamentosView({
  lancamentos,
  opcoes,
}: {
  lancamentos: LancamentoItem[];
  opcoes: OpcoesLancamento;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmar, setConfirmar] = useState<LancamentoItem | null>(null);

  function cancelar(id: string) {
    start(async () => {
      const r = await cancelarLancamento({ id });
      if (r.ok) {
        toast.success("Cancelado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluir(id: string) {
    start(async () => {
      const r = await excluirLancamento({ id });
      if (r.ok) {
        toast.success("Excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Lançamentos</h2>
          <p className="text-sm text-muted-foreground">{lancamentos.length} lançamento(s).</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" /> Novo lançamento
        </Button>
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lancamentos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhum lançamento.
                </TableCell>
              </TableRow>
            ) : (
              lancamentos.map((l) => (
                <TableRow key={l.id} className={l.status === "cancelado" ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs">{dt(l.data)}</TableCell>
                  <TableCell>
                    <span className="font-medium">{l.descricao}</span>
                    {l.projeto && (
                      <span className="block text-xs text-muted-foreground">
                        {formatarCodigo(l.projeto.codigo)} · {l.projeto.nome}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {l.categoria.codigo} {l.categoria.nome}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono ${l.tipo === "receita" ? "text-success" : "text-foreground"}`}
                  >
                    {l.tipo === "despesa" ? "-" : "+"}
                    {brl(Number(l.valorEfetivo ?? l.valor))}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_CHIP[l.status]}>
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {l.status !== "cancelado" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" aria-label="Ações">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          {l.status === "previsto" && (
                            <DropdownMenuItem onClick={() => setConfirmar(l)}>
                              <Check className="size-4" /> Confirmar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => cancelar(l.id)}>
                            <Ban className="size-4" /> Cancelar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => excluir(l.id)}>
                            <Trash2 className="size-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <LancamentoForm open={formOpen} onOpenChange={setFormOpen} opcoes={opcoes} />
      <ConfirmarDialog
        lancamento={confirmar}
        onClose={() => setConfirmar(null)}
        contas={opcoes.contas}
        formas={opcoes.formas}
      />
    </div>
  );
}
