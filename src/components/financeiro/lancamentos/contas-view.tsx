"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Check } from "lucide-react";
import type { LancamentoItem, OpcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { LancamentoForm } from "./lancamento-form";
import { ConfirmarDialog } from "./confirmar-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dt(d: string | Date | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "—";
}
function venceEm(d: string | Date | null): "vencido" | "hoje" | "futuro" | null {
  if (!d) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(d);
  v.setHours(0, 0, 0, 0);
  if (v < hoje) return "vencido";
  if (v.getTime() === hoje.getTime()) return "hoje";
  return "futuro";
}

export function ContasView({
  itens,
  opcoes,
  tipo,
}: {
  itens: LancamentoItem[];
  opcoes: OpcoesLancamento;
  tipo: "despesa" | "receita";
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmar, setConfirmar] = useState<LancamentoItem | null>(null);

  const titulo = tipo === "despesa" ? "Contas a pagar" : "Contas a receber";
  const total = itens.reduce((s, l) => s + Number(l.valor), 0);
  const vencidos = itens.filter((l) => venceEm(l.vencimento) === "vencido");

  function confirmarRapido(l: LancamentoItem) {
    if (l.contaId) {
      // Já tem conta: confirma direto.
      start(async () => {
        const { confirmarLancamento } = await import("@/modules/financeiro/lancamentos/actions");
        const r = await confirmarLancamento({ id: l.id });
        if (r.ok) {
          toast.success(tipo === "despesa" ? "Pago." : "Recebido.");
          router.refresh();
        } else toast.error(r.error);
      });
    } else {
      setConfirmar(l);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">{titulo}</h2>
          <p className="text-sm text-muted-foreground">
            {itens.length} em aberto · total {brl(total)}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" /> Nova conta
        </Button>
      </div>

      {vencidos.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em] text-destructive">
              Vencidas
            </CardDescription>
            <CardTitle className="text-xl text-destructive">
              {vencidos.length} · {brl(vencidos.reduce((s, l) => s + Number(l.valor), 0))}
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimento</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>{tipo === "despesa" ? "Fornecedor" : "Cliente"}</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nada em aberto.
                </TableCell>
              </TableRow>
            ) : (
              itens.map((l) => {
                const status = venceEm(l.vencimento);
                return (
                  <TableRow key={l.id}>
                    <TableCell
                      className={`font-mono text-xs ${status === "vencido" ? "text-destructive" : status === "hoje" ? "text-warning" : ""}`}
                    >
                      {dt(l.vencimento)}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{l.descricao}</span>
                      {l.projeto && (
                        <span className="block text-xs text-muted-foreground">
                          {formatarCodigo(l.projeto.codigo)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.fornecedor?.nome ?? l.cliente?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{brl(Number(l.valor))}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => confirmarRapido(l)}>
                        <Check className="size-3.5" /> {tipo === "despesa" ? "Pagar" : "Receber"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <LancamentoForm open={formOpen} onOpenChange={setFormOpen} opcoes={opcoes} tipoInicial={tipo} />
      <ConfirmarDialog
        lancamento={confirmar}
        onClose={() => setConfirmar(null)}
        contas={opcoes.contas}
        formas={opcoes.formas}
      />
    </div>
  );
}
