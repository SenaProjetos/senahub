"use client";

import { useEffect, useState } from "react";
import { brl, formatarDataHora } from "@/lib/utils";
import { fmtHoras } from "@/modules/ponto/format";
import { buscarDetalheDoMesRateio } from "@/modules/rh/rateio/fechamento/detalhe-actions";
import type { DetalheDoMes } from "@/modules/rh/rateio/fechamento/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROTULO_EVENTO: Record<string, string> = { fechou: "Fechou", reabriu: "Reabriu", recalculou: "Recalculou no cálculo novo" };

function rotuloDoGrupo(g: DetalheDoMes["grupos"][number]): string {
  if (g.natureza === "nao_alocado") return "Não alocado (sem projeto)";
  const base = g.projeto ?? "Projeto";
  if (g.natureza === "reuniao") return `Reunião · ${base}`;
  return g.disciplina ? `${base} · ${g.disciplina}` : base;
}

/**
 * Detalhe de um mês do rateio (R3.5): horas por projeto e disciplina, e o histórico de fechar,
 * reabrir e recalcular com motivo. Os reais só chegam do servidor para quem vê custo.
 */
export function RateioDetalheDialog({
  ano,
  mes,
  fechado,
  titulo,
  onOpenChange,
}: {
  ano: number;
  mes: number;
  /** Já conhecido pela lista: a descrição não pisca "aberto" enquanto o detalhe carrega. */
  fechado: boolean;
  titulo: string;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [detalhe, setDetalhe] = useState<DetalheDoMes | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    buscarDetalheDoMesRateio(ano, mes)
      .then((d) => vivo && setDetalhe(d))
      .catch(() => vivo && setDetalhe(null));
    return () => {
      vivo = false;
    };
  }, [ano, mes]);

  const comCusto = detalhe?.grupos.some((g) => g.custoCent !== null) ?? false;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {fechado ? "Mês fechado: valores congelados no fechamento." : "Mês aberto: estimativa com o ponto de agora."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {detalhe === undefined && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {detalhe === null && <p className="text-sm text-destructive">Não foi possível carregar o detalhe deste mês.</p>}
          {detalhe && (
            <>
              {detalhe.grupos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma hora marcada neste mês.</p>
              ) : (
                <div className="overflow-x-auto rounded-sm border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Projeto e disciplina</TableHead>
                        <TableHead className="text-right">Horas</TableHead>
                        {comCusto && <TableHead className="text-right">Custo</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalhe.grupos.map((g, i) => (
                        <TableRow key={i}>
                          <TableCell className="max-w-72 truncate" title={rotuloDoGrupo(g)}>
                            {rotuloDoGrupo(g)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmtHoras(g.minutos)}</TableCell>
                          {comCusto && <TableCell className="text-right font-mono tabular-nums">{brl((g.custoCent ?? 0) / 100)}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div>
                <h3 className="mb-1 text-sm font-semibold">Histórico</h3>
                {detalhe.eventos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Este mês nunca foi fechado nem reaberto.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {detalhe.eventos.map((e, i) => (
                      <li key={i} className="py-2">
                        <p>
                          <span className="font-medium">{ROTULO_EVENTO[e.tipo] ?? e.tipo}</span>
                          {e.custoCent !== null && <span className="text-muted-foreground"> · {brl(e.custoCent / 100)}</span>}
                          <span className="text-muted-foreground">
                            {" "}
                            · {e.autor ?? "alguém"} · {formatarDataHora(e.criadoEm)}
                          </span>
                        </p>
                        {e.motivo && <p className="text-muted-foreground">Motivo: {e.motivo}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
