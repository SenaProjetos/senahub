"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, ArrowUp, ArrowDown } from "lucide-react";
import type { DREComparativo, LinhaDREAnalise } from "@/modules/financeiro/relatorios/dre";
import type { FatiaCategoria, ResultadoProjeto, EvolucaoCategorias } from "@/modules/financeiro/relatorios/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { CategoriaDonutChart } from "@/components/financeiro/categoria-donut-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(v: number | null) {
  if (v == null) return "—";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function RelatoriosView({
  dre,
  indicadores,
  despesasCat,
  receitasCat,
  porProjeto,
  evolucao,
}: {
  dre: DREComparativo;
  indicadores: { projetosAtivos: number; recebido: number; aReceber: number };
  despesasCat: { fatias: FatiaCategoria[]; total: number };
  receitasCat: { fatias: FatiaCategoria[]; total: number };
  porProjeto: ResultadoProjeto[];
  evolucao: EvolucaoCategorias;
}) {
  const router = useRouter();
  const [de, setDe] = useState(dre.de);
  const [ate, setAte] = useState(dre.ate);

  function aplicar() {
    router.push(`/financeiro/relatorios?de=${de}&ate=${ate}`);
  }

  const ahResultado = ahResultadoColuna(dre);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Relatórios</h2>
          <p className="text-sm text-muted-foreground">
            DRE por competência, com análise vertical (AV), horizontal (AH) e EBITDA.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
          </div>
          <Button onClick={aplicar}>Aplicar</Button>
          <Button
            variant="outline"
            render={<a href={`/api/financeiro/relatorios/dre/xlsx?de=${de}&ate=${ate}`} />}
          >
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard titulo="Resultado" valor={dre.resultado} cor variacao={ahResultado} />
        <KpiCard titulo="EBITDA (gerencial)" valor={dre.ebitda} cor />
        <KpiCard titulo="Recebido" valor={indicadores.recebido} />
        <KpiCard titulo="A receber" valor={indicadores.aReceber} tom="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demonstração de Resultado (DRE)</CardTitle>
          <CardDescription>
            {dre.de} a {dre.ate} · comparado com {dre.anterior.de} a {dre.anterior.ate}. AV = % sobre receita;
            AH = variação vs. período anterior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Cabecalho />
          <Secao titulo="Receitas" linhas={dre.receitas} total={dre.totalReceitas} cor="text-success" />
          <Secao titulo="Despesas" linhas={dre.despesas} total={dre.totalDespesas} cor="text-foreground" />
          <div className="flex items-center justify-between border-t pt-3 text-sm font-bold">
            <span className="flex-1">Resultado do período</span>
            <span className="w-28 text-right font-mono">{pct(ahResultadoColuna(dre))}</span>
            <span className={`w-36 text-right font-mono ${dre.resultado < 0 ? "text-destructive" : "text-success"}`}>
              {brl(dre.resultado)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            EBITDA (gerencial): resultado das categorias operacionais (exclui financiamento/investimento).
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Despesas por categoria</CardTitle>
            <CardDescription>Confirmadas no período · total {brl(despesasCat.total)}.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoriaDonutChart dados={despesasCat.fatias} total={despesasCat.total} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Receitas por categoria</CardTitle>
            <CardDescription>Confirmadas no período · total {brl(receitasCat.total)}.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoriaDonutChart dados={receitasCat.fatias} total={receitasCat.total} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resultado por projeto</CardTitle>
          <CardDescription>Receitas, despesas e resultado confirmados no período, por projeto.</CardDescription>
        </CardHeader>
        <CardContent>
          {porProjeto.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem movimentos por projeto no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-1.5 font-medium">Projeto</th>
                    <th className="py-1.5 text-right font-medium">Receita</th>
                    <th className="py-1.5 text-right font-medium">Despesa</th>
                    <th className="py-1.5 text-right font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {porProjeto.map((p) => (
                    <tr key={p.projetoId} className="border-b last:border-0">
                      <td className="py-1.5">
                        <span className="font-mono text-xs text-muted-foreground">{formatarCodigo(p.codigo)}</span> {p.nome}
                      </td>
                      <td className="py-1.5 text-right font-mono text-success">{brl(p.receita)}</td>
                      <td className="py-1.5 text-right font-mono">{brl(p.despesa)}</td>
                      <td className={`py-1.5 text-right font-mono font-semibold ${p.resultado < 0 ? "text-destructive" : "text-success"}`}>
                        {brl(p.resultado)}
                      </td>
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
          <CardTitle className="text-base">Evolução de despesas por categoria — {evolucao.ano}</CardTitle>
          <CardDescription>Despesas confirmadas por mês (categorias de nível 1).</CardDescription>
        </CardHeader>
        <CardContent>
          {evolucao.categorias.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem despesas confirmadas no ano.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-right uppercase tracking-wider text-muted-foreground">
                    <th className="py-1.5 text-left font-medium">Categoria</th>
                    {evolucao.meses.map((m) => (
                      <th key={m} className="px-1.5 py-1.5 font-medium capitalize">{m}</th>
                    ))}
                    <th className="px-1.5 py-1.5 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {evolucao.categorias.map((c) => (
                    <tr key={c.nome} className="border-b last:border-0">
                      <td className="py-1.5 text-left">{c.nome}</td>
                      {c.valores.map((v, i) => (
                        <td key={i} className="px-1.5 py-1.5 text-right font-mono text-muted-foreground">
                          {v ? brlK(v) : "—"}
                        </td>
                      ))}
                      <td className="px-1.5 py-1.5 text-right font-mono font-semibold">{brlK(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function brlK(v: number) {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function ahResultadoColuna(dre: DREComparativo): number | null {
  if (dre.anterior.resultado === 0) return null;
  return ((dre.resultado - dre.anterior.resultado) / Math.abs(dre.anterior.resultado)) * 100;
}

function KpiCard({
  titulo,
  valor,
  cor = false,
  tom,
  variacao,
}: {
  titulo: string;
  valor: number;
  cor?: boolean;
  tom?: "warning";
  variacao?: number | null;
}) {
  const corValor = tom === "warning" ? "text-warning" : cor ? (valor < 0 ? "text-destructive" : "text-success") : "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">{titulo}</CardDescription>
        <CardTitle className={`text-2xl ${corValor}`}>{brl(valor)}</CardTitle>
        {variacao != null && (
          <span className={`flex items-center gap-0.5 text-xs ${variacao >= 0 ? "text-success" : "text-destructive"}`}>
            {variacao >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {pct(variacao)} vs. período anterior
          </span>
        )}
      </CardHeader>
    </Card>
  );
}

function Cabecalho() {
  return (
    <div className="flex items-center justify-between border-b pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
      <span className="flex-1">Categoria</span>
      <span className="w-16 text-right">AV</span>
      <span className="w-20 text-right">AH</span>
      <span className="w-36 text-right">Valor</span>
    </div>
  );
}

function Secao({
  titulo,
  linhas,
  total,
  cor,
}: {
  titulo: string;
  linhas: LinhaDREAnalise[];
  total: number;
  cor: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm font-semibold">
        <span className="flex-1">{titulo}</span>
        <span className="w-16" />
        <span className="w-20" />
        <span className={`w-36 text-right font-mono ${cor}`}>{brl(total)}</span>
      </div>
      {linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem movimentos.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {linhas.map((l) => (
            <li key={l.codigo} className="flex items-center text-muted-foreground">
              <span className="flex-1 truncate">
                <span className="font-mono text-xs">{l.codigo}</span> {l.nome}
              </span>
              <span className="w-16 text-right font-mono text-xs">{l.av.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
              <span
                className={`w-20 text-right font-mono text-xs ${l.ah == null ? "" : l.ah >= 0 ? "text-success" : "text-destructive"}`}
              >
                {pct(l.ah)}
              </span>
              <span className="w-36 text-right font-mono">{brl(l.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
