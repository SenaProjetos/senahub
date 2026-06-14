"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Orcamento, LinhaOrcamento, MesResultado } from "@/modules/financeiro/relatorios/queries";
import { salvarOrcamentoItem } from "@/modules/financeiro/orcamento/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResultadoMensalChart } from "@/components/financeiro/resultado-mensal-chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Categoria = { id: string; codigo: string; nome: string; tipo: string };

function LinhaRow({ ano, l, podeGerir }: { ano: number; l: LinhaOrcamento; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valor, setValor] = useState(l.planejado ? String(l.planejado) : "");

  function salvar() {
    const novo = Number(valor) || 0;
    if (novo === l.planejado) return;
    start(async () => {
      const r = await salvarOrcamentoItem({ ano, categoriaId: l.categoriaId, valorPlanejado: novo });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  const pct = l.planejado > 0 ? Math.round((l.realizado / l.planejado) * 100) : l.realizado > 0 ? 100 : 0;
  const estourou = l.planejado > 0 && l.realizado > l.planejado;

  return (
    <tr className="hover:bg-muted/40">
      <td className="py-2 pr-3">
        <span className="font-mono text-xs text-muted-foreground">{l.codigo}</span> {l.nome}
      </td>
      <td className="py-2 pr-3 text-right">
        {podeGerir ? (
          <Input
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={salvar}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            disabled={pending}
            className="h-8 w-28 text-right font-mono text-xs"
            placeholder="0"
          />
        ) : (
          <span className="font-mono text-xs">{brl(l.planejado)}</span>
        )}
      </td>
      <td className="py-2 pr-3 text-right font-mono text-xs text-muted-foreground">{brl(l.previsto)}</td>
      <td className="py-2 pr-3 text-right font-mono text-xs">{brl(l.realizado)}</td>
      <td className="py-2 w-40">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted">
            <div className={`h-full ${estourou ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <span className={`w-9 text-right font-mono text-xs ${estourou ? "text-destructive" : "text-muted-foreground"}`}>{pct}%</span>
        </div>
      </td>
    </tr>
  );
}

function Secao({
  ano,
  titulo,
  tipo,
  linhas,
  categorias,
  podeGerir,
}: {
  ano: number;
  titulo: string;
  tipo: "receita" | "despesa";
  linhas: LinhaOrcamento[];
  categorias: Categoria[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novaCat, setNovaCat] = useState("");
  const [novoValor, setNovoValor] = useState("");

  const presentes = new Set(linhas.map((l) => l.categoriaId));
  const disponiveis = categorias.filter((c) => c.tipo === tipo && !presentes.has(c.id));

  function adicionar() {
    const valor = Number(novoValor) || 0;
    if (!novaCat || valor <= 0) {
      toast.error("Selecione a categoria e informe um valor.");
      return;
    }
    start(async () => {
      const r = await salvarOrcamentoItem({ ano, categoriaId: novaCat, valorPlanejado: valor });
      if (r.ok) {
        setNovaCat("");
        setNovoValor("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="overflow-x-auto">
      {linhas.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Sem {titulo.toLowerCase()} em {ano}.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Categoria</th>
              <th className="py-2 pr-3 text-right">Planejado</th>
              <th className="py-2 pr-3 text-right">Previsto</th>
              <th className="py-2 pr-3 text-right">Realizado</th>
              <th className="w-40 py-2">% do orçado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((l) => (
              <LinhaRow key={l.categoriaId} ano={ano} l={l} podeGerir={podeGerir} />
            ))}
          </tbody>
        </table>
      )}

      {podeGerir && disponiveis.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <Select value={novaCat} onValueChange={(v) => setNovaCat(v ?? "")}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Adicionar categoria ao orçamento…" />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} · {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={novoValor}
            onChange={(e) => setNovoValor(e.target.value)}
            placeholder="Valor planejado"
            className="h-9 w-40 text-right font-mono text-xs"
          />
          <Button size="sm" variant="outline" onClick={adicionar} disabled={pending || !novaCat}>
            <Plus className="size-3.5" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

export function OrcamentoView({
  ano,
  orcamento,
  serieMensal,
  categorias,
  podeGerir,
}: {
  ano: number;
  orcamento: Orcamento;
  serieMensal: MesResultado[];
  categorias: Categoria[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const t = orcamento.totais;
  const atual = new Date().getFullYear();
  const anos = [atual + 1, atual, atual - 1, atual - 2];
  const resultadoRealizado = t.receitaRealizada - t.despesaRealizada;

  const kpis = [
    { label: "Despesa planejada", value: brl(t.despesaPlanejada) },
    { label: "Despesa realizada", value: brl(t.despesaRealizada), destaque: t.despesaRealizada <= t.despesaPlanejada || t.despesaPlanejada === 0 },
    { label: "Receita realizada", value: brl(t.receitaRealizada) },
    { label: "Resultado realizado", value: brl(resultadoRealizado), destaque: resultadoRealizado >= 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Orçamento anual</h2>
          <p className="text-sm text-muted-foreground">
            Planejado × previsto × realizado por categoria. Edite o valor planejado por linha.
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
          <CardTitle className="text-base">Resultado mensal — {ano}</CardTitle>
          <CardDescription>Receita − despesa realizadas, por mês.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResultadoMensalChart dados={serieMensal} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Despesas</CardTitle>
        </CardHeader>
        <CardContent>
          <Secao ano={ano} titulo="Despesas" tipo="despesa" linhas={orcamento.despesas} categorias={categorias} podeGerir={podeGerir} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Receitas</CardTitle>
        </CardHeader>
        <CardContent>
          <Secao ano={ano} titulo="Receitas" tipo="receita" linhas={orcamento.receitas} categorias={categorias} podeGerir={podeGerir} />
        </CardContent>
      </Card>
    </div>
  );
}
