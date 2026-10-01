import Link from "next/link";
import { AlertTriangle, CircleAlert, Info, Wallet } from "lucide-react";
import type { TorreDeControle } from "@/modules/financeiro/liquidez/queries";
import type { AlertaTorre } from "@/modules/financeiro/liquidez/torre";
import { brlC, brlCInteiro } from "@/components/financeiro/planejador/formato";
import { SaldoProjetadoChart } from "@/components/financeiro/liquidez/saldo-projetado-chart";
import { SeloConfianca, SeloPrioridade } from "@/components/financeiro/selos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import { cn } from "@/lib/utils";

/**
 * Torre de controle da Visão geral (F7, mock "Financeiro — Visão geral"): posição de hoje, os cinco
 * indicadores da projeção, o saldo projetado nos dois cenários, o que precisa de atenção, as
 * caixinhas e os próximos sete dias. Tudo vem do motor do planejador (`torreDeControle`) — a Visão
 * geral não faz conta própria.
 */

const ICONE: Record<AlertaTorre["nivel"], typeof Info> = { erro: CircleAlert, atencao: AlertTriangle, info: Info };
const COR: Record<AlertaTorre["nivel"], string> = {
  erro: "border-destructive/40 bg-destructive/5 text-destructive",
  atencao: "border-warning/40 bg-warning/5 text-warning",
  info: "border-border bg-muted/30 text-muted-foreground",
};

export function TorreLiquidez({
  torre,
  contas,
}: {
  torre: TorreDeControle;
  contas: readonly { id: string; nome: string; saldo: number }[];
}) {
  const { posicao, caixaAtual, reservaMinima } = torre;
  const pctReservado = caixaAtual > 0 ? Math.min(100, Math.round((posicao.reservado / caixaAtual) * 100)) : 0;
  const pctReserva = caixaAtual > 0 ? Math.min(100, (reservaMinima / caixaAtual) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-6 pt-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold">Posição de hoje, {diaMes(torre.hoje)}</h2>
              <span className="text-[13px] text-muted-foreground">
                {torre.anomalias.semConta.quantidade > 0
                  ? `inclui ${brlC(torre.anomalias.semConta.valor)} realizados sem conta bancária`
                  : "saldo das contas ativas, só realizados"}
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Caixa atual</p>
                <p className="font-mono text-3xl font-bold">{brlCInteiro(caixaAtual)}</p>
              </div>
              <span aria-hidden className="pb-1.5 font-mono text-xl text-muted-foreground">=</span>
              <div>
                <p className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  <i aria-hidden className="inline-block size-2.5 bg-[var(--chart-1)]" /> Reservado nas caixinhas
                </p>
                <p className="font-mono text-xl font-semibold">{brlCInteiro(posicao.reservado)}</p>
              </div>
              <span aria-hidden className="pb-1.5 font-mono text-xl text-muted-foreground">+</span>
              <div>
                <p className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  <i aria-hidden className="inline-block size-2.5 border-[1.5px] border-[var(--chart-1)]" /> Dinheiro livre
                </p>
                <p className="font-mono text-xl font-semibold">{brlCInteiro(posicao.livre)}</p>
              </div>
            </div>

            <div className="relative pt-5">
              <div
                role="img"
                aria-label={`Do caixa de ${brlC(caixaAtual)}, ${brlC(posicao.reservado)} estão reservados (${pctReservado}%) e ${brlC(posicao.livre)} estão livres. Reserva mínima de ${brlC(reservaMinima)}.`}
                className="flex h-5 overflow-hidden rounded-sm border border-[var(--chart-1)]"
              >
                <span style={{ width: `${pctReservado}%`, background: "var(--chart-1)" }} />
                <span
                  className="flex-1"
                  style={{ background: "repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--chart-1) 18%, transparent) 5px 7px)" }}
                />
              </div>
              {caixaAtual > 0 && (
                <>
                  <div className="absolute top-0 -bottom-1 border-l-2 border-dashed border-muted-foreground" style={{ left: `${pctReserva}%` }} />
                  <span
                    className="absolute top-0 text-[12px] font-semibold whitespace-nowrap text-muted-foreground"
                    style={{ left: `calc(${pctReserva}% + 6px)` }}
                  >
                    Reserva mínima {brlCInteiro(reservaMinima)}
                  </span>
                </>
              )}
            </div>
            {posicao.descoberto > 0 && (
              <p className="text-[13px] font-medium text-destructive">
                {brlC(posicao.descoberto)} reservados além do caixa: há caixinha sem dinheiro para cobrir.
              </p>
            )}
          </div>

          <div className="space-y-1.5 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
            <h3 className="text-[13px] font-semibold text-muted-foreground">Por conta bancária</h3>
            {contas.length === 0 ? (
              <EmptyState icon={Wallet} title="Nenhuma conta cadastrada." />
            ) : (
              <ul className="space-y-1 text-sm">
                {contas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{c.nome}</span>
                    <span className="font-mono text-xs">{brlC(Math.round(c.saldo * 100))}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="pt-1">
              <Link href="/financeiro/conciliacao" className="text-[13px] font-semibold underline-offset-2 hover:underline">
                Conciliar extratos
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <section aria-label="Indicadores da projeção" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {torre.indicadores.map((i) => (
          <Card key={i.id}>
            <CardContent className="space-y-1 pt-5">
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{i.rotulo}</p>
              <p
                className={cn(
                  "font-mono text-xl font-bold",
                  typeof i.valor === "number" && i.valor < 0 && "text-destructive",
                )}
              >
                {typeof i.valor === "number" ? brlCInteiro(i.valor) : i.valor}
              </p>
              <p className="text-[12.5px] text-muted-foreground">{i.detalhe}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">
              Saldo projetado, {diaMes(torre.hoje)} a {diaMes(torre.grafico.dias.at(-1) ?? torre.hoje)}
            </CardTitle>
            <Button variant="outline" size="sm" render={<Link href="/financeiro/planejador" />}>
              Simular no planejador
            </Button>
          </CardHeader>
          <CardContent>
            <SaldoProjetadoChart grafico={torre.grafico} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">Precisa de atenção</CardTitle>
            {torre.alertas.length > 0 && (
              <span className="rounded-sm border px-1.5 py-0.5 font-mono text-xs">{torre.alertas.length}</span>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {torre.alertas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada pedindo decisão agora.</p>
            ) : (
              torre.alertas.map((a) => {
                const Icone = ICONE[a.nivel];
                return (
                  <div key={a.id} className={cn("flex gap-2 rounded-sm border px-2.5 py-2 text-[13px]", COR[a.nivel])}>
                    <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p className="text-foreground">
                      <b>{a.titulo}</b> {a.texto}
                      {a.link && (
                        <>
                          {" "}
                          <Link href={a.link.href} className="font-semibold underline-offset-2 hover:underline">
                            {a.link.rotulo}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">Caixinhas</CardTitle>
            <Button variant="outline" size="sm" render={<Link href="/financeiro/caixinhas" />}>
              Ver todas
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {torre.caixinhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma caixinha ativa.</p>
            ) : (
              torre.caixinhas.map((c) => (
                <div key={c.id}>
                  <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
                    <span className="truncate font-semibold">{c.nome}</span>
                    <span className="font-mono whitespace-nowrap">
                      {brlC(c.reservado)}
                      {c.necessidade != null && <span className="text-muted-foreground"> de {brlC(c.necessidade)}</span>}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Progress valor={c.percentual ?? 0} rotulo={`${c.nome}: ${c.percentual ?? 0}% do que está comprometido`} className="flex-1" />
                    <span className="w-10 text-right font-mono text-[12.5px]">{c.percentual != null ? `${c.percentual}%` : "—"}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {c.necessidade == null
                      ? "sem meta definida"
                      : c.falta && c.falta > 0
                        ? `faltam ${brlC(c.falta)}`
                        : "reservado cobre o que está comprometido"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">Próximos 7 dias</CardTitle>
            <Button variant="outline" size="sm" render={<Link href="/financeiro/contas" />}>
              Contas
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {torre.proximos.length === 0 ? (
              <p className="px-6 pb-5 text-sm text-muted-foreground">Nada previsto nos próximos 7 dias.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {torre.proximos.map((l) => (
                    <TableRow key={l.eventoId}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {diaMes(l.dia)}
                        {l.vencido && <span className="ml-1 text-destructive">vencido</span>}
                      </TableCell>
                      <TableCell>
                        <span className="block">{l.descricao}</span>
                        {l.sub && <span className="block text-xs text-muted-foreground">{l.sub}</span>}
                      </TableCell>
                      <TableCell>
                        {l.tipo === "despesa"
                          ? l.prioridade && <SeloPrioridade prioridade={l.prioridade} />
                          : l.confianca && <SeloConfianca confianca={l.confianca} />}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono text-xs", l.tipo === "receita" ? "text-success" : "text-destructive")}>
                        {l.tipo === "receita" ? "+" : "−"}
                        {brlC(l.valor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
