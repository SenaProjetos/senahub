"use client";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, LayoutGrid } from "lucide-react";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { itensDaLinhaDeDimensao } from "@/modules/financeiro/relatorios/acoes";
import type { DimensaoRelatorio, RelatorioPorDimensao } from "@/modules/financeiro/relatorios/queries";
import { brl } from "@/lib/utils";

const ROTULO_DIMENSAO: Record<DimensaoRelatorio, string> = {
  categoria: "Categoria",
  centro: "Centro de custo",
  contato: "Contato (fornecedor/cliente)",
  projeto: "Projeto",
  tag: "Tag",
};

/**
 * Relatório por dimensão (M6): confirmados do período, agrupados por categoria, centro, contato, projeto ou
 * tag — "monte o seu" que faltava no Financeiro. Cada linha tem menu de contexto (ADR-0002); exporta em Excel.
 */
export function RelatorioDimensaoView({
  relatorio,
  subnav,
}: {
  relatorio: RelatorioPorDimensao;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const [dimensao, setDimensao] = useState<DimensaoRelatorio>(relatorio.dimensao);
  const [de, setDe] = useState(relatorio.de);
  const [ate, setAte] = useState(relatorio.ate);

  function aplicar() {
    router.push(`/financeiro/relatorio-dimensao?dimensao=${dimensao}&de=${de}&ate=${ate}`);
  }

  const totalReceita = relatorio.linhas.reduce((s, l) => s + l.receita, 0);
  const totalDespesa = relatorio.linhas.reduce((s, l) => s + l.despesa, 0);

  function aoSelecionar(item: AcaoItemAcao) {
    void item;
  }

  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Relatório por dimensão" descricao="Receita, despesa e resultado agrupados como você escolher." />
      {subnav}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="grid gap-1.5">
            <Label htmlFor="rd-dim">Agrupar por</Label>
            <Select value={dimensao} onValueChange={(v) => v && setDimensao(v as DimensaoRelatorio)} items={ROTULO_DIMENSAO}>
              <SelectTrigger id="rd-dim" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROTULO_DIMENSAO) as DimensaoRelatorio[]).map((d) => (
                  <SelectItem key={d} value={d}>
                    {ROTULO_DIMENSAO[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rd-de">De</Label>
            <Input id="rd-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rd-ate">Até</Label>
            <Input id="rd-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
          </div>
          <Button onClick={aplicar}>Aplicar</Button>
          <Button
            variant="outline"
            render={<a href={`/api/financeiro/relatorios/dimensao/xlsx?dimensao=${relatorio.dimensao}&de=${relatorio.de}&ate=${relatorio.ate}`} />}
          >
            <Download className="size-4" aria-hidden /> Exportar
          </Button>
        </CardContent>
      </Card>

      {relatorio.dimensao === "tag" && (
        <p className="text-xs text-muted-foreground">
          Um lançamento com mais de uma tag entra na linha de cada tag: a soma das linhas pode passar do total do período.
        </p>
      )}
      {(relatorio.dimensao === "centro" || relatorio.dimensao === "projeto") && (
        <p className="text-xs text-muted-foreground">
          Lançamento rateado entra dividido pelas linhas do rateio (menu de contexto → Ratear) — &ldquo;Lançamentos&rdquo;
          conta a parte, não o lançamento inteiro. O centro/projeto do cadastro continua valendo no resto do sistema.
        </p>
      )}

      {relatorio.linhas.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="Nada no período." description="Mude o período ou a dimensão acima." />
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <DicaMenuContexto />
            {/* `relative`: o `sr-only` da última coluna é absoluto e, sem ancestral posicionado, escaparia da rolagem. */}
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="py-2 pr-3">{ROTULO_DIMENSAO[relatorio.dimensao]}</th>
                    <th className="py-2 pr-3 text-right">Receita</th>
                    <th className="py-2 pr-3 text-right">Despesa</th>
                    <th className="py-2 pr-3 text-right">Resultado</th>
                    <th className="py-2 pr-3 text-right">Lançamentos</th>
                    <th className="w-10 py-2">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.linhas.map((l) => {
                    const itens = itensDaLinhaDeDimensao({ chave: l.chave, dimensao: relatorio.dimensao });
                    return (
                      <LinhaComMenu key={l.chave} itens={itens} onSelect={aoSelecionar} render={<tr className="border-b last:border-0 hover:bg-muted/20 data-[popup-open]:bg-muted/30" />}>
                        <td className="py-2 pr-3">{l.nome}</td>
                        <td className="py-2 pr-3 text-right font-mono">{l.receita > 0 ? brl(l.receita) : "—"}</td>
                        <td className="py-2 pr-3 text-right font-mono">{l.despesa > 0 ? brl(l.despesa) : "—"}</td>
                        <td className={`py-2 pr-3 text-right font-mono ${l.resultado >= 0 ? "text-success" : "text-destructive"}`}>{brl(l.resultado)}</td>
                        <td className="py-2 pr-3 text-right font-mono text-xs text-muted-foreground">{l.qtd}</td>
                        <td className="py-2">
                          <BotaoAcoes itens={itens} onSelect={aoSelecionar} rotulo={`Ações de ${l.nome}`} className="size-8" />
                        </td>
                      </LinhaComMenu>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t font-bold">
                    <td className="py-2 pr-3">Total</td>
                    <td className="py-2 pr-3 text-right font-mono">{brl(totalReceita)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{brl(totalDespesa)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{brl(totalReceita - totalDespesa)}</td>
                    <td className="py-2 pr-3" />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {relatorio.semDimensao > 0 && (
              <p className="text-xs text-muted-foreground">
                {relatorio.semDimensao} {relatorio.semDimensao === 1 ? "lançamento" : "lançamentos"} sem {ROTULO_DIMENSAO[relatorio.dimensao].toLowerCase()} ficaram fora da tabela.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
