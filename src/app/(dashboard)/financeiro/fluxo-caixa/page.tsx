import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { requirePermission } from "@/lib/session";
import { fluxoDiario, JANELAS_PASSADO, type CenarioFluxo } from "@/modules/financeiro/caixa/queries";
import type { Agrupamento } from "@/modules/financeiro/caixa/diario";
import { FluxoDiarioChart } from "@/components/financeiro/caixa/fluxo-diario-chart";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { brlC, brlCSinal } from "@/components/financeiro/planejador/formato";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Fluxo de caixa" };

const AGRUPAMENTOS: { valor: Agrupamento; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
];
const CENARIOS: { valor: CenarioFluxo; rotulo: string }[] = [
  { valor: "provavel", rotulo: "Provável" },
  { valor: "conservador", rotulo: "Conservador" },
];

/** Grupo de links que troca UM parâmetro da URL, com o atual marcado (`aria-current`). */
function Segmentos<T extends string>({
  rotulo,
  opcoes,
  atual,
  href,
}: {
  rotulo: string;
  opcoes: readonly { valor: T; rotulo: string }[];
  atual: T;
  href: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex overflow-hidden rounded-sm border">
      {opcoes.map((o) => (
        <Link
          key={o.valor}
          href={href(o.valor)}
          aria-current={o.valor === atual ? "true" : undefined}
          className={cn(
            "px-2.5 py-1.5 text-[13px] font-medium transition-colors",
            o.valor === atual ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          {o.rotulo}
        </Link>
      ))}
    </div>
  );
}

export default async function FluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ agrupar?: string; cenario?: string; dias?: string }>;
}) {
  await requirePermission("financeiro", "ver");
  const sp = await searchParams;
  const fluxo = await fluxoDiario({
    agrupamento: sp.agrupar as Agrupamento | undefined,
    cenario: sp.cenario as CenarioFluxo | undefined,
    diasAtras: Number(sp.dias) || undefined,
  });

  const url = (troca: Record<string, string>) => {
    const p = new URLSearchParams({ agrupar: fluxo.agrupamento, cenario: fluxo.cenario, dias: String(fluxo.diasAtras), ...troca });
    return `/financeiro/fluxo-caixa?${p.toString()}`;
  };
  const periodo = (de: string | null, ate: string | null) => (de && ate ? `${diaMes(de)} a ${diaMes(ate)}` : "sem movimento no período");
  const { realizado, previsto } = fluxo.totais;

  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Fluxo de caixa" descricao="O que entrou e saiu, e o que está previsto, dia a dia." />
      <NavFinanceiro />

      <div className="flex flex-wrap items-center gap-2">
        <Segmentos rotulo="Agrupar por" opcoes={AGRUPAMENTOS} atual={fluxo.agrupamento} href={(v) => url({ agrupar: v })} />
        <Segmentos
          rotulo="Dias antes de hoje"
          opcoes={JANELAS_PASSADO.map((d) => ({ valor: String(d), rotulo: `${d} dias atrás` }))}
          atual={String(fluxo.diasAtras)}
          href={(v) => url({ dias: v })}
        />
        <Segmentos rotulo="Previsto pelo cenário" opcoes={CENARIOS} atual={fluxo.cenario} href={(v) => url({ cenario: v })} />
        <span className="text-[12.5px] text-muted-foreground">
          {diaMes(fluxo.de)} a {diaMes(fluxo.ate)} · caixa de hoje {brlC(fluxo.caixaAtual)}
        </span>
      </div>

      <section aria-label="Totais do período" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { rotulo: `Entradas realizadas (${periodo(realizado.de, realizado.ate)})`, valor: realizado.entradas, sinal: 1 },
          { rotulo: `Saídas realizadas (${periodo(realizado.de, realizado.ate)})`, valor: realizado.saidas, sinal: -1 },
          { rotulo: `Entradas previstas (${periodo(previsto.de, previsto.ate)})`, valor: previsto.entradas, sinal: 1 },
          { rotulo: `Saídas previstas (${periodo(previsto.de, previsto.ate)})`, valor: previsto.saidas, sinal: -1 },
        ].map((k) => (
          <Card key={k.rotulo}>
            <CardContent className="space-y-1 pt-5">
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{k.rotulo}</p>
              <p className={cn("font-mono text-xl font-bold", k.sinal > 0 ? "text-success" : "text-destructive")}>
                {brlCSinal(k.sinal * k.valor)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saldo acumulado</CardTitle>
        </CardHeader>
        <CardContent>
          <FluxoDiarioChart serie={fluxo.diaria} reservaMinima={fluxo.reservaMinima} hoje={fluxo.hoje} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {fluxo.agrupamento === "dia" ? "Dia a dia" : fluxo.agrupamento === "semana" ? "Semana a semana" : "Mês a mês"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{fluxo.agrupamento === "dia" ? "Data" : "Período"}</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                  <TableHead className="text-right">Saldo do período</TableHead>
                  <TableHead className="text-right">Saldo acumulado</TableHead>
                  <TableHead>Maior movimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Linha sem movimento não vai para a tabela: o gráfico já mostra o dia parado, e a
                    lista fica legível (o mock oferecia a opção; aqui é o padrão). */}
                {fluxo.linhas
                  .filter((l) => l.entradas > 0 || l.saidas > 0)
                  .map((l) => (
                    <TableRow key={l.dia} className={l.acumulado < fluxo.reservaMinima ? "bg-destructive/5" : undefined}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{l.rotulo}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-sm border px-1.5 py-0.5 text-[11px]",
                            l.tipo === "previsto" ? "border-border text-muted-foreground" : "border-success/40 text-success",
                          )}
                        >
                          {l.tipo === "previsto" ? "Previsto" : "Realizado"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-success">{l.entradas ? brlCSinal(l.entradas) : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-destructive">{l.saidas ? brlCSinal(-l.saidas) : "—"}</TableCell>
                      <TableCell className={cn("text-right font-mono text-xs", l.saldoDia < 0 ? "text-destructive" : "text-success")}>
                        {brlCSinal(l.saldoDia)}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono text-xs font-semibold", l.acumulado < 0 && "text-destructive")}>
                        {brlC(l.acumulado)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.maior ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                {fluxo.linhas.every((l) => l.entradas === 0 && l.saidas === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum movimento realizado nem previsto neste período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
