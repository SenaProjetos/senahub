"use client";

import { useRouter } from "next/navigation";
import type { Orcamento, LinhaOrcamento } from "@/modules/financeiro/relatorios/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Secao({ titulo, linhas }: { titulo: string; linhas: LinhaOrcamento[] }) {
  if (linhas.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">{titulo}</th>
            <th className="py-2 pr-3 text-right">Previsto</th>
            <th className="py-2 pr-3 text-right">Realizado</th>
            <th className="py-2 pr-3 text-right">Total</th>
            <th className="w-40 py-2">% realizado</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {linhas.map((l) => {
            const total = l.previsto + l.realizado;
            const pct = total > 0 ? Math.round((l.realizado / total) * 100) : 0;
            return (
              <tr key={l.codigo} className="hover:bg-muted/40">
                <td className="py-2 pr-3">
                  <span className="font-mono text-xs text-muted-foreground">{l.codigo}</span> {l.nome}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-xs text-muted-foreground">{brl(l.previsto)}</td>
                <td className="py-2 pr-3 text-right font-mono text-xs">{brl(l.realizado)}</td>
                <td className="py-2 pr-3 text-right font-mono text-xs font-semibold">{brl(total)}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-9 text-right font-mono text-xs text-muted-foreground">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OrcamentoView({ ano, orcamento }: { ano: number; orcamento: Orcamento }) {
  const router = useRouter();
  const t = orcamento.totais;
  const atual = new Date().getFullYear();
  const anos = [atual + 1, atual, atual - 1, atual - 2];
  const resultadoRealizado = t.receitaRealizada - t.despesaRealizada;

  const kpis = [
    { label: "Receita prevista", value: brl(t.receitaPrevista) },
    { label: "Receita realizada", value: brl(t.receitaRealizada) },
    { label: "Despesa realizada", value: brl(t.despesaRealizada) },
    { label: "Resultado realizado", value: brl(resultadoRealizado), destaque: resultadoRealizado >= 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Orçamento anual</h2>
          <p className="text-sm text-muted-foreground">
            Previsto × realizado por categoria, por competência. Total = previsto + realizado.
          </p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => router.push(`/financeiro/orcamento?ano=${v ?? ano}`)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
                {k.label}
              </CardDescription>
              <CardTitle
                className={`text-2xl ${k.destaque === undefined ? "" : k.destaque ? "text-success" : "text-destructive"}`}
              >
                {k.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Receitas</CardTitle>
        </CardHeader>
        <CardContent>
          {orcamento.receitas.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Sem receitas em {ano}.</p>
          ) : (
            <Secao titulo="Categoria" linhas={orcamento.receitas} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Despesas</CardTitle>
        </CardHeader>
        <CardContent>
          {orcamento.despesas.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Sem despesas em {ano}.</p>
          ) : (
            <Secao titulo="Categoria" linhas={orcamento.despesas} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
