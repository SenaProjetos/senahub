"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import type { DRE } from "@/modules/financeiro/relatorios/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function RelatoriosView({
  dre,
  indicadores,
}: {
  dre: DRE;
  indicadores: { projetosAtivos: number; recebido: number; aReceber: number };
}) {
  const router = useRouter();
  const [de, setDe] = useState(dre.de);
  const [ate, setAte] = useState(dre.ate);

  function aplicar() {
    router.push(`/financeiro/relatorios?de=${de}&ate=${ate}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Relatórios</h2>
          <p className="text-sm text-muted-foreground">DRE e indicadores por competência.</p>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Resultado</CardDescription>
            <CardTitle className={`text-2xl ${dre.resultado < 0 ? "text-destructive" : "text-success"}`}>
              {brl(dre.resultado)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Recebido</CardDescription>
            <CardTitle className="text-2xl text-success">{brl(indicadores.recebido)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">A receber</CardDescription>
            <CardTitle className="text-2xl text-warning">{brl(indicadores.aReceber)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demonstração de Resultado (DRE)</CardTitle>
          <CardDescription>
            {dre.de} a {dre.ate}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Secao titulo="Receitas" linhas={dre.receitas} total={dre.totalReceitas} cor="text-success" />
          <Secao titulo="Despesas" linhas={dre.despesas} total={dre.totalDespesas} cor="text-foreground" />
          <div className="flex items-center justify-between border-t pt-3 text-sm font-bold">
            <span>Resultado do período</span>
            <span className={`font-mono ${dre.resultado < 0 ? "text-destructive" : "text-success"}`}>
              {brl(dre.resultado)}
            </span>
          </div>
        </CardContent>
      </Card>
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
  linhas: { codigo: string; nome: string; valor: number }[];
  total: number;
  cor: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm font-semibold">
        <span>{titulo}</span>
        <span className={`font-mono ${cor}`}>{brl(total)}</span>
      </div>
      {linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem movimentos.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {linhas.map((l) => (
            <li key={l.codigo} className="flex items-center justify-between text-muted-foreground">
              <span>
                <span className="font-mono text-xs">{l.codigo}</span> {l.nome}
              </span>
              <span className="font-mono">{brl(l.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
