"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarSync } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/utils";
import { previewTrocaDataBase, aplicarTrocaDataBase } from "@/modules/custos/orcamento/actions";
import type { RelatorioImpacto } from "@/modules/custos/orcamento/troca-data-base";

type BaseOpcao = { id: string; nome: string };

const SITUACAO_LABEL: Record<string, string> = {
  alterado: "Alterado",
  inalterado: "Inalterado",
  sem_preco_na_nova: "Sem cotação na nova",
  bloqueado_preservado: "Travado (preservado)",
};

function pct(v: number) {
  const s = v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v > 0 ? "+" : ""}${s}%`;
}

export function TrocarDataBaseDialog({
  orcamentoId,
  bases,
  basePrecoAtualId,
}: {
  orcamentoId: string;
  bases: BaseOpcao[];
  basePrecoAtualId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [baseNovaId, setBaseNovaId] = useState("");
  const [relatorio, setRelatorio] = useState<RelatorioImpacto | null>(null);
  const [carregando, startPreview] = useTransition();
  const [aplicando, startAplicar] = useTransition();

  const opcoes = bases.filter((b) => b.id !== basePrecoAtualId);

  function fechar() {
    setOpen(false);
    setBaseNovaId("");
    setRelatorio(null);
  }

  function gerarPreview(id: string) {
    setBaseNovaId(id);
    setRelatorio(null);
    startPreview(async () => {
      const r = await previewTrocaDataBase({ orcamentoId, basePrecoNovaId: id });
      if (r.ok) setRelatorio(r.data);
      else toast.error(r.error);
    });
  }

  function confirmar() {
    startAplicar(async () => {
      const r = await aplicarTrocaDataBase({ orcamentoId, basePrecoNovaId: baseNovaId });
      if (r.ok) {
        toast.success("Data-base trocada e custos recalculados.");
        fechar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarSync className="size-4" /> Trocar data-base
      </Button>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Trocar data-base</DialogTitle>
          <DialogDescription>
            Escolha a nova base de preço e confira o impacto <strong>antes</strong> de confirmar. Itens
            travados e itens sem cotação na base nova mantêm o custo atual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="max-w-md space-y-1.5">
            <Label>Nova base de preço</Label>
            <Select value={baseNovaId} onValueChange={(v) => v && gerarPreview(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a base" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {carregando && <p className="text-sm text-muted-foreground">Calculando impacto…</p>}

          {relatorio && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(relatorio.contagem).map(([situacao, n]) => (
                  <Badge key={situacao} variant="outline">
                    {SITUACAO_LABEL[situacao] ?? situacao}: {n}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap gap-6 rounded-lg border p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Total antes</p>
                  <p className="font-bold">{brl(relatorio.totalAntes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total depois</p>
                  <p className="font-bold">{brl(relatorio.totalDepois)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Variação</p>
                  <p
                    className={`font-bold ${
                      relatorio.variacaoPct > 0
                        ? "text-destructive"
                        : relatorio.variacaoPct < 0
                          ? "text-success"
                          : ""
                    }`}
                  >
                    {pct(relatorio.variacaoPct)}
                  </p>
                </div>
              </div>

              {relatorio.linhas.length > 0 && (
                <div className="max-h-72 overflow-y-auto rounded-sm border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Antes</TableHead>
                        <TableHead className="text-right">Depois</TableHead>
                        <TableHead className="text-right">Var.</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relatorio.linhas.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-mono text-xs">{l.codigo}</TableCell>
                          <TableCell className="text-sm">{l.descricao}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{brl(l.custoAntes)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{brl(l.custoDepois)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{pct(l.variacaoPct)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {SITUACAO_LABEL[l.situacao] ?? l.situacao}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={aplicando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={aplicando || !relatorio}>
            {aplicando ? "Aplicando…" : "Confirmar troca"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
