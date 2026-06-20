"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Printer, Lock, Unlock, Trash2, RefreshCw } from "lucide-react";
import { gerarFechamento, fecharMes, reabrirFechamento, excluirFechamento } from "@/modules/financeiro/fechamento/actions";
import type { FechamentoItem } from "@/modules/financeiro/fechamento/queries";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { brl } from "@/lib/utils";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function FechamentoView({
  fechamentos,
  anoAtual,
  mesAtual,
}: {
  fechamentos: FechamentoItem[];
  anoAtual: number;
  mesAtual: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ano, setAno] = useState(String(anoAtual));
  const [mes, setMes] = useState(String(mesAtual));

  const anos = Array.from({ length: 6 }, (_, i) => anoAtual - i);

  function gerar() {
    start(async () => {
      const r = await gerarFechamento({ ano: Number(ano), mes: Number(mes) });
      if (r.ok) {
        toast.success("Fechamento gerado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Fechamento mensal</h2>
        <p className="text-sm text-muted-foreground">
          Consolida receita/despesa e a folha de projetistas do mês, com retenções automáticas.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Mês</Label>
            <Select value={mes} onValueChange={(v) => setMes(v ?? mes)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES_LONGO.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ano</Label>
            <Select value={ano} onValueChange={(v) => setAno(v ?? ano)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={gerar} disabled={pending}>
            <RefreshCw className="size-4" /> {pending ? "Gerando…" : "Gerar / atualizar fechamento"}
          </Button>
          <p className="text-xs text-muted-foreground">
            As alíquotas vêm de Configurações → Alíquotas do fechamento.
          </p>
        </CardContent>
      </Card>

      {fechamentos.length === 0 ? (
        <Card><CardContent><EmptyState icon={Lock} title="Nenhum fechamento gerado ainda." /></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {fechamentos.map((f) => <FechamentoCard key={f.id} f={f} />)}
        </div>
      )}
    </div>
  );
}

function FechamentoCard({ f }: { f: FechamentoItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fechado = f.status === "fechado";

  function acao(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(ok);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function imprimir() {
    const win = window.open("", "_blank", "width=800,height=700");
    if (!win) return;
    const linha = (r: string, v: number, b = false) =>
      `<tr${b ? ' style="font-weight:bold;border-top:2px solid #999"' : ""}><td>${r}</td><td style="text-align:right">${brl(v)}</td></tr>`;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Fechamento ${MESES_LONGO[f.mes - 1]} ${f.ano}</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}td{border-bottom:1px solid #eee;padding:5px 8px}h2{font-size:14px;margin-top:18px}</style>
      </head><body>
      <h1>Fechamento mensal — ${MESES_LONGO[f.mes - 1]} ${f.ano}</h1>
      <p>Responsável: ${f.responsavel} · Status: ${fechado ? "Fechado" : "Aberto"}</p>
      <h2>Resultado do mês</h2>
      <table>${linha("Receita confirmada", f.receitaConfirmada)}${linha("Despesa confirmada", f.despesaConfirmada)}${linha("Resultado bruto", f.resultadoBruto, true)}</table>
      <h2>Folha de projetistas</h2>
      <table>${linha("Valor bruto", f.folhaBruta)}${linha("Retenção ISS", f.retencaoIss)}${linha("Retenção INSS", f.retencaoInss)}${linha("Retenção IR", f.retencaoIr)}${linha("Descontos", f.descontos)}${linha("Valor líquido", f.folhaLiquida, true)}</table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">
          {MESES[f.mes - 1]}/{f.ano}
          <Badge variant="outline" className={`ml-2 ${fechado ? "text-success border-success/40" : "text-warning border-warning/40"}`}>
            {fechado ? "Fechado" : "Aberto"}
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Imprimir" onClick={imprimir}><Printer className="size-4" /></Button>
          {fechado ? (
            <Button variant="outline" size="sm" onClick={() => acao(() => reabrirFechamento({ id: f.id }), "Mês reaberto.")} disabled={pending}>
              <Unlock className="size-4" /> Reabrir
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => acao(() => fecharMes({ id: f.id }), "Mês fechado.")} disabled={pending}>
                <Lock className="size-4" /> Fechar mês
              </Button>
              <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => acao(() => excluirFechamento({ id: f.id }), "Fechamento excluído.")} disabled={pending}>
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Resultado do mês</p>
          <Linha r="Receita confirmada" v={f.receitaConfirmada} />
          <Linha r="Despesa confirmada" v={f.despesaConfirmada} />
          <Linha r="Resultado bruto" v={f.resultadoBruto} bold cor={f.resultadoBruto < 0 ? "text-destructive" : "text-success"} />
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Folha de projetistas</p>
          <Linha r="Valor bruto" v={f.folhaBruta} />
          <Linha r="Retenção ISS" v={f.retencaoIss} />
          <Linha r="Retenção INSS" v={f.retencaoInss} />
          <Linha r="Retenção IR" v={f.retencaoIr} />
          <Linha r="Descontos" v={f.descontos} />
          <Linha r="Valor líquido" v={f.folhaLiquida} bold />
        </div>
      </CardContent>
    </Card>
  );
}

function Linha({ r, v, bold, cor }: { r: string; v: number; bold?: boolean; cor?: string }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t pt-1 font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{r}</span>
      <span className={`font-mono ${cor ?? ""}`}>{brl(v)}</span>
    </div>
  );
}
