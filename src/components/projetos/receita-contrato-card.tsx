"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt, Wand2, Trash2 } from "lucide-react";
import { definirValorContrato, gerarParcelas, limparParcelas, faturarEntrega } from "@/modules/projetos/receita/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { brl, formatarData } from "@/lib/utils";

type Parcela = { id: string; descricao: string; valor: number; status: string; vencimento: string };
type DisciplinaFaturavel = { id: string; nome: string; valor: number; status: string; faturada: boolean };
type Receita = {
  valorContrato: number | null;
  valorReferencia: number | null;
  usandoComposicao: boolean;
  totalComposicao: number;
  parcelas: Parcela[];
  faturadoPrevisto: number;
  faturadoConfirmado: number;
  faturadoTotal: number;
  aFaturar: number | null;
  disciplinas: DisciplinaFaturavel[];
};

export function ReceitaContratoCard({ projetoId, receita }: { projetoId: string; receita: Receita }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valor, setValor] = useState(receita.valorContrato != null ? String(receita.valorContrato) : "");
  const [gerar, setGerar] = useState(false);

  function salvarContrato(novo?: number) {
    const v = novo ?? (valor ? Number(valor) : null);
    start(async () => {
      const r = await definirValorContrato({ projetoId, valorContrato: v });
      if (r.ok) {
        toast.success("Valor de contrato salvo.");
        if (novo != null) setValor(String(novo));
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function limpar() {
    start(async () => {
      const r = await limparParcelas({ projetoId });
      if (r.ok) {
        toast.success(`${r.data.removidas} parcela(s) prevista(s) removida(s).`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function faturar(disciplinaId: string) {
    start(async () => {
      const r = await faturarEntrega({ disciplinaId });
      if (r.ok) {
        toast.success("Entrega faturada — recebível previsto criado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const r = receita;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4" /> Receita / Contrato
        </CardTitle>
        <div className="flex items-center gap-2">
          {r.parcelas.some((p) => p.status === "previsto") && (
            <Button variant="ghost" size="sm" onClick={limpar} disabled={pending}>
              <Trash2 className="size-3.5" /> Limpar previstas
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setGerar(true)}>
            <Wand2 className="size-3.5" /> Gerar parcelas
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Valor de contrato + atalho da composição */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Valor de contrato (R$)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-44"
                placeholder="0,00"
              />
              <Button size="sm" onClick={() => salvarContrato()} disabled={pending}>
                Salvar
              </Button>
            </div>
          </div>
          {r.totalComposicao > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => salvarContrato(r.totalComposicao)}
              disabled={pending}
              title="Usar o total da composição de preço como valor de contrato"
            >
              Usar composição: {brl(r.totalComposicao)}
            </Button>
          )}
        </div>

        {/* Comparativo referência × faturado (P-23: composição substitui contrato) */}
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi
            label={r.usandoComposicao ? "Composição (ref.)" : "Contratado"}
            valor={r.valorReferencia != null ? brl(r.valorReferencia) : "—"}
          />
          <Kpi label="Faturado (previsto)" valor={brl(r.faturadoPrevisto)} />
          <Kpi label="Recebido" valor={brl(r.faturadoConfirmado)} cor="text-success" />
          <Kpi
            label="A faturar"
            valor={r.aFaturar != null ? brl(r.aFaturar) : "—"}
            cor={r.aFaturar != null && r.aFaturar < 0 ? "text-destructive" : undefined}
          />
        </div>

        {/* Parcelas */}
        {r.parcelas.length === 0 ? (
          <EmptyState icon={Receipt} title="Sem parcelas — gere os recebíveis a partir do contrato." />
        ) : (
          <ul className="divide-y text-sm">
            {r.parcelas.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate">{p.descricao}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatarData(p.vencimento)}
                  </span>
                  <span className="font-mono">{brl(p.valor)}</span>
                  <StatusBadge tone={p.status === "confirmado" ? "success" : "warning"}>
                    {p.status === "confirmado" ? "recebido" : "previsto"}
                  </StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* N-26: faturar por entrega (alternativa às parcelas) */}
        {r.disciplinas.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Faturar por entrega
            </p>
            <ul className="divide-y text-sm">
              {r.disciplinas.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="truncate">
                    {d.nome}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{brl(d.valor)}</span>
                  </span>
                  {d.faturada ? (
                    <StatusBadge tone="success">faturada</StatusBadge>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => faturar(d.id)} disabled={pending}>
                      <Receipt className="size-3.5" /> Faturar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <GerarParcelasDialog
        open={gerar}
        onClose={() => setGerar(false)}
        projetoId={projetoId}
        valorSugerido={r.valorReferencia ?? 0}
      />
    </Card>
  );
}

function Kpi({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`font-mono text-lg font-bold ${cor ?? ""}`}>{valor}</p>
    </div>
  );
}

function GerarParcelasDialog({
  open,
  onClose,
  projetoId,
  valorSugerido,
}: {
  open: boolean;
  onClose: () => void;
  projetoId: string;
  valorSugerido: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const hoje = new Date().toISOString().slice(0, 10);
  const [valorTotal, setValorTotal] = useState(valorSugerido ? String(valorSugerido) : "");
  const [numero, setNumero] = useState("3");
  const [dataPrimeira, setDataPrimeira] = useState(hoje);
  const [intervalo, setIntervalo] = useState("1");

  function confirmar() {
    start(async () => {
      const res = await gerarParcelas({
        projetoId,
        valorTotal: Number(valorTotal),
        numeroParcelas: Number(numero),
        dataPrimeira,
        intervaloMeses: Number(intervalo),
      });
      if (res.ok) {
        toast.success(`${res.data.parcelas} parcela(s) gerada(s) como recebíveis.`);
        onClose();
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar parcelas do contrato</DialogTitle>
          <DialogDescription>
            Cria receitas previstas (recebíveis) somando o valor total. Substitui as parcelas previstas
            existentes; recebidas são preservadas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Valor total (R$)</Label>
            <Input type="number" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Parcelas</Label>
              <Input type="number" min="1" max="120" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Intervalo (meses)</Label>
              <Input type="number" min="0" max="12" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>1ª parcela</Label>
              <Input type="date" value={dataPrimeira} onChange={(e) => setDataPrimeira(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !valorTotal}>
            {pending ? "Gerando…" : "Gerar parcelas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
