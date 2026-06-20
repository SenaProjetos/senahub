"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, TrendingUp, Users, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { RentabilidadeRelatorio, MargemMensal, CustoDisciplina } from "@/modules/financeiro/relatorios/queries";
import type { CoordenadorRentab } from "@/modules/financeiro/relatorios/dre-projeto";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brl } from "@/lib/utils";

function pct(v: number | null) {
  return v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function RentabilidadeView({
  dados,
  evolucao,
  ano,
  porCoordenador,
  custoDisciplina,
}: {
  dados: RentabilidadeRelatorio;
  evolucao: MargemMensal[];
  ano: number;
  porCoordenador: CoordenadorRentab[];
  custoDisciplina: CustoDisciplina[];
}) {
  const router = useRouter();
  const [de, setDe] = useState(dados.de);
  const [ate, setAte] = useState(dados.ate);
  const [margem, setMargem] = useState(String(dados.margemMinima));

  function aplicar() {
    router.push(`/financeiro/rentabilidade?de=${de}&ate=${ate}&margem=${margem || 0}`);
  }

  const t = dados.totais;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Rentabilidade por projeto</h2>
          <p className="text-sm text-muted-foreground">
            DRE por projeto. Indiretos (despesas sem projeto) rateados pela receita.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-36" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-36" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Margem mín. (%)</Label>
            <Input type="number" value={margem} onChange={(e) => setMargem(e.target.value)} className="w-24" />
          </div>
          <Button onClick={aplicar}>Aplicar</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Receita" valor={brl(t.receita)} />
        <Kpi titulo="Custos diretos" valor={brl(t.diretos)} />
        <Kpi titulo="Indiretos (rateados)" valor={brl(t.indireto)} />
        <Kpi titulo="Lucro líquido" valor={brl(t.lucroLiquido)} cor={t.lucroLiquido < 0 ? "text-destructive" : "text-success"} sub={`Margem ${pct(t.margemLiquida)}`} />
      </div>

      {dados.alertas.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="size-4" /> Projetos abaixo da margem mínima ({pct(dados.margemMinima)})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {dados.alertas.map((p) => (
                <li key={p.projetoId} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="font-mono text-xs text-muted-foreground">{formatarCodigo(p.codigo)}</span> {p.nome}
                  </span>
                  <span className="font-mono text-destructive">{pct(p.margemLiquida)} · {brl(p.lucroLiquido)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ranking de projetos</CardTitle>
          <CardDescription>Ordenados por lucro líquido no período.</CardDescription>
        </CardHeader>
        <CardContent>
          {dados.projetos.length === 0 ? (
            <EmptyState icon={TrendingUp} title="Sem movimento confirmado por projeto no período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-1.5 font-medium">Projeto</th>
                    <th className="py-1.5 text-right font-medium">Receita</th>
                    <th className="py-1.5 text-right font-medium">Diretos</th>
                    <th className="py-1.5 text-right font-medium">Indireto</th>
                    <th className="py-1.5 text-right font-medium">Lucro líq.</th>
                    <th className="py-1.5 text-right font-medium">M. líq.</th>
                    <th className="py-1.5 text-right font-medium">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.projetos.map((p) => (
                    <tr key={p.projetoId} className="border-b last:border-0">
                      <td className="py-1.5">
                        <span className="font-mono text-xs text-muted-foreground">{formatarCodigo(p.codigo)}</span> {p.nome}
                        {p.cliente && <span className="block text-xs text-muted-foreground">{p.cliente}</span>}
                      </td>
                      <td className="py-1.5 text-right font-mono">{brl(p.receita)}</td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{brl(p.diretos)}</td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{brl(p.indiretoRateado)}</td>
                      <td className={`py-1.5 text-right font-mono font-semibold ${p.lucroLiquido < 0 ? "text-destructive" : "text-success"}`}>
                        {brl(p.lucroLiquido)}
                      </td>
                      <td className={`py-1.5 text-right font-mono ${p.margemLiquida != null && p.margemLiquida < 0 ? "text-destructive" : ""}`}>{pct(p.margemLiquida)}</td>
                      <td className="py-1.5 text-right font-mono">{pct(p.roi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="size-4" /> Ranking de clientes</CardTitle>
          <CardDescription>Clientes mais lucrativos no período.</CardDescription>
        </CardHeader>
        <CardContent>
          {dados.clientes.length === 0 ? (
            <EmptyState icon={Users} title="Sem dados por cliente." />
          ) : (
            <ul className="divide-y text-sm">
              {dados.clientes.map((c) => (
                <li key={c.cliente} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate">{c.cliente} <span className="text-xs text-muted-foreground">· {c.projetos} projeto(s)</span></span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{brl(c.receita)}</span>
                    <span className={`font-mono font-semibold ${c.lucroLiquido < 0 ? "text-destructive" : "text-success"}`}>{brl(c.lucroLiquido)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ranking de coordenadores</CardTitle>
          <CardDescription>Resultado dos projetos agregado por coordenador.</CardDescription>
        </CardHeader>
        <CardContent>
          {porCoordenador.length === 0 ? (
            <EmptyState icon={Users} title="Sem dados por coordenador." />
          ) : (
            <ul className="divide-y text-sm">
              {porCoordenador.map((c) => (
                <li key={c.coordenador} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate">{c.coordenador} <span className="text-xs text-muted-foreground">· {c.projetos} projeto(s)</span></span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{brl(c.receita)}</span>
                    <span className={`font-mono font-semibold ${c.lucroLiquido < 0 ? "text-destructive" : "text-success"}`}>{brl(c.lucroLiquido)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Custo por disciplina</CardTitle>
          <CardDescription>Orçado (valor da disciplina) × pago aos projetistas no período.</CardDescription>
        </CardHeader>
        <CardContent>
          {custoDisciplina.length === 0 ? (
            <EmptyState icon={Wallet} title="Sem pagamentos de projetistas no período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-1.5 font-medium">Disciplina</th>
                    <th className="py-1.5 text-right font-medium">Orçado</th>
                    <th className="py-1.5 text-right font-medium">Pago</th>
                    <th className="py-1.5 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {custoDisciplina.map((d) => (
                    <tr key={d.disciplinaId} className="border-b last:border-0">
                      <td className="py-1.5">
                        {d.nome}
                        <span className="block text-xs text-muted-foreground">{d.projeto}</span>
                      </td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{brl(d.orcado)}</td>
                      <td className="py-1.5 text-right font-mono">{brl(d.pago)}</td>
                      <td className={`py-1.5 text-right font-mono font-semibold ${d.saldo < 0 ? "text-destructive" : ""}`}>{brl(d.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução da margem — {ano}</CardTitle>
          <CardDescription>Receita, resultado e margem líquida realizados por mês.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-right uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 text-left font-medium">Mês</th>
                {evolucao.map((m) => <th key={m.mes} className="px-1.5 py-1.5 font-medium capitalize">{m.rotulo}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-1.5 text-left text-muted-foreground">Receita</td>
                {evolucao.map((m) => <td key={m.mes} className="px-1.5 py-1.5 text-right font-mono text-muted-foreground">{m.receita ? brl(m.receita) : "—"}</td>)}
              </tr>
              <tr className="border-b">
                <td className="py-1.5 text-left text-muted-foreground">Resultado</td>
                {evolucao.map((m) => <td key={m.mes} className={`px-1.5 py-1.5 text-right font-mono ${m.resultado < 0 ? "text-destructive" : ""}`}>{m.resultado ? brl(m.resultado) : "—"}</td>)}
              </tr>
              <tr>
                <td className="py-1.5 text-left font-medium">Margem</td>
                {evolucao.map((m) => (
                  <td key={m.mes} className={`px-1.5 py-1.5 text-right font-mono font-semibold ${m.margem == null ? "text-muted-foreground" : m.margem < 0 ? "text-destructive" : "text-success"}`}>
                    {pct(m.margem)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ titulo, valor, cor, sub }: { titulo: string; valor: string; cor?: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">{titulo}</CardDescription>
        <CardTitle className={`text-2xl ${cor ?? ""}`}>{valor}</CardTitle>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </CardHeader>
    </Card>
  );
}
