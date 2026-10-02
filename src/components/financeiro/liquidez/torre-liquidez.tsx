import Link from "next/link";
import { AlertTriangle, CircleAlert, Info, Wallet } from "lucide-react";
import type { TorreDeControle } from "@/modules/financeiro/liquidez/queries";
import type { AlertaTorre, CaixinhaDaTorre } from "@/modules/financeiro/liquidez/torre";
import { brlC, brlCInteiro } from "@/components/financeiro/planejador/formato";
import { SaldoProjetadoChart } from "@/components/financeiro/liquidez/saldo-projetado-chart";
import { SeloConfianca, SeloPrioridade } from "@/components/financeiro/selos";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
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

/** Quantos avisos ficam à vista; o resto abre num "Mais N avisos" (a coluna não estica o gráfico). */
const ALERTAS_A_VISTA = 4;

/** Rótulo de número em destaque: frase normal, não caixa-alta espaçada (lê melhor e não quebra em 2 linhas). */
const ROTULO = "text-[13px] text-muted-foreground";

/** Caixinha que vale mostrar: tem dinheiro reservado ou algo a cobrir. As vazias viram uma linha só. */
function caixinhaRelevante(c: CaixinhaDaTorre): boolean {
  return c.reservado > 0 || (c.necessidade != null && c.necessidade > 0);
}

function Alerta({ a }: { a: AlertaTorre }) {
  const Icone = ICONE[a.nivel];
  return (
    <div className={cn("flex gap-2 rounded-sm border px-2.5 py-2 text-[13px]", COR[a.nivel])}>
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
}

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
  const alertasVisiveis = torre.alertas.slice(0, ALERTAS_A_VISTA);
  const alertasExtras = torre.alertas.slice(ALERTAS_A_VISTA);
  const caixinhas = torre.caixinhas.filter(caixinhaRelevante);
  const caixinhasVazias = torre.caixinhas.length - caixinhas.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-6 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-bold">Posição de hoje, {diaMes(torre.hoje)}</h2>
              <span className="text-[13px] text-muted-foreground">
                {torre.anomalias.semConta.quantidade > 0
                  ? `inclui ${brlC(torre.anomalias.semConta.valor)} realizados sem conta bancária`
                  : "saldo das contas ativas, só o que já foi pago ou recebido"}
              </span>
            </div>

            {/* Caixa = reservado + livre. No celular vira lista: os sinais soltos de "=" e "+" sobravam
                no fim da linha e liam como lixo. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-6">
              <div>
                <p className={ROTULO}>Caixa atual</p>
                <p className="font-mono text-3xl font-bold">{brlCInteiro(caixaAtual)}</p>
              </div>
              <span aria-hidden className="hidden pb-1.5 font-mono text-xl text-muted-foreground sm:inline">
                =
              </span>
              <div>
                <p className={cn(ROTULO, "inline-flex items-center gap-1.5")}>
                  <i aria-hidden className="inline-block size-2.5 bg-[var(--chart-1)]" /> Reservado nas caixinhas
                </p>
                <p className="font-mono text-xl font-semibold">{brlCInteiro(posicao.reservado)}</p>
              </div>
              <span aria-hidden className="hidden pb-1.5 font-mono text-xl text-muted-foreground sm:inline">
                +
              </span>
              <div>
                <p className={cn(ROTULO, "inline-flex items-center gap-1.5")}>
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
              {caixaAtual > 0 && reservaMinima > 0 && (
                <>
                  <div className="absolute top-0 -bottom-1 border-l-2 border-dashed border-muted-foreground" style={{ left: `${pctReserva}%` }} />
                  <span
                    className="absolute top-0 text-[12px] font-semibold whitespace-nowrap text-muted-foreground"
                    style={pctReserva > 60 ? { right: `calc(${100 - pctReserva}% + 6px)` } : { left: `calc(${pctReserva}% + 6px)` }}
                  >
                    Reserva mínima {brlCInteiro(reservaMinima)}
                  </span>
                </>
              )}
            </div>
            {reservaMinima <= 0 && (
              <p className="text-[12.5px] text-muted-foreground">
                Reserva mínima ainda não definida.{" "}
                <Link href="/financeiro/planejador" className="font-semibold underline-offset-2 hover:underline">
                  Definir no planejador
                </Link>
              </p>
            )}
            {posicao.descoberto > 0 && (
              <p className="text-[13px] font-medium text-destructive">
                {brlC(posicao.descoberto)} reservados além do caixa: há caixinha sem dinheiro para cobrir.
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-1.5 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
            <h3 className="text-[13px] font-semibold text-muted-foreground">Por conta bancária</h3>
            {contas.length === 0 ? (
              <EmptyState icon={Wallet} title="Nenhuma conta cadastrada." />
            ) : (
              // Nome trunca, valor nunca quebra: antes o "R$" ia para uma linha e o número para outra.
              <ul className="space-y-1 text-sm">
                {contas.map((c) => (
                  <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
                    <span className="truncate" title={c.nome}>
                      {c.nome}
                    </span>
                    <span className={cn("font-mono text-xs whitespace-nowrap", c.saldo < 0 && "text-destructive")}>
                      {brlC(Math.round(c.saldo * 100))}
                    </span>
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
              <p className={ROTULO}>{i.rotulo}</p>
              <p className={cn("font-mono text-xl font-bold", typeof i.valor === "number" && i.valor < 0 && "text-destructive")}>
                {typeof i.valor === "number" ? brlCInteiro(i.valor) : i.valor}
              </p>
              <p className="text-[12px] leading-snug text-muted-foreground">{i.detalhe}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Saldo projetado, {diaMes(torre.hoje)} a {diaMes(torre.grafico.dias.at(-1) ?? torre.hoje)}
            </CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" render={<Link href="/financeiro/planejador" />}>
                Simular no planejador
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <SaldoProjetadoChart grafico={torre.grafico} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Precisa de atenção
              {torre.alertas.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                  {torre.alertas.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {torre.alertas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada pedindo decisão agora.</p>
            ) : (
              <>
                {alertasVisiveis.map((a) => (
                  <Alerta key={a.id} a={a} />
                ))}
                {alertasExtras.length > 0 && (
                  // <details> abre sem JavaScript e é acessível de fábrica (teclado e leitor de tela).
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[13px] font-semibold underline-offset-2 hover:underline">
                      <span className="group-open:hidden">
                        Mais {alertasExtras.length} {alertasExtras.length === 1 ? "aviso" : "avisos"}
                      </span>
                      <span className="hidden group-open:inline">Mostrar menos</span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      {alertasExtras.map((a) => (
                        <Alerta key={a.id} a={a} />
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Caixinhas</CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" render={<Link href="/financeiro/caixinhas" />}>
                Ver todas
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            {caixinhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma caixinha com reserva ou compromisso.</p>
            ) : (
              caixinhas.map((c) => (
                <div key={c.id}>
                  <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
                    <span className="truncate font-semibold">{c.nome}</span>
                    <span className="font-mono whitespace-nowrap">
                      {brlCInteiro(c.reservado)}
                      {c.necessidade != null && c.necessidade > 0 && (
                        <span className="text-muted-foreground"> de {brlCInteiro(c.necessidade)}</span>
                      )}
                    </span>
                  </div>
                  {/* Barra só quando há o que cobrir: sem meta, ela não mede nada. */}
                  {c.necessidade != null && c.necessidade > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      <Progress
                        valor={c.percentual ?? 0}
                        rotulo={`${c.nome}: ${c.percentual ?? 0}% do que está comprometido`}
                        tom={c.falta && c.falta > 0 ? "alerta" : "primario"}
                        className="flex-1"
                      />
                      <span className="w-10 text-right font-mono text-[12.5px]">{c.percentual ?? 0}%</span>
                    </div>
                  )}
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {c.necessidade == null
                      ? "sem meta definida"
                      : c.necessidade === 0
                        ? "nada comprometido no horizonte"
                        : c.falta && c.falta > 0
                          ? `faltam ${brlCInteiro(c.falta)}`
                          : "reservado cobre o que está comprometido"}
                  </p>
                </div>
              ))
            )}
            {caixinhasVazias > 0 && (
              <p className="text-[12px] text-muted-foreground">
                {caixinhasVazias === 1 ? "1 caixinha" : `${caixinhasVazias} caixinhas`} sem reserva nem compromisso.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximos 7 dias</CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" render={<Link href="/financeiro/contas" />}>
                Contas a pagar
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {torre.proximos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada previsto nos próximos 7 dias.</p>
            ) : (
              // Lista em vez de tabela: a tabela de 4 colunas não cabia ao lado das caixinhas e o
              // VALOR (a coluna mais importante) era cortado fora da tela.
              <ul className="divide-y">
                {torre.proximos.map((l) => (
                  <li key={l.eventoId} className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-3 py-2">
                    <span className="pt-0.5 font-mono text-xs">
                      {diaMes(l.dia)}
                      {l.vencido && <span className="block text-[11px] text-destructive">vencido</span>}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm" title={l.descricao}>
                        {l.descricao}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {l.tipo === "despesa"
                          ? l.prioridade && <SeloPrioridade prioridade={l.prioridade} />
                          : l.confianca && <SeloConfianca confianca={l.confianca} />}
                        {l.sub && <span className="truncate">{l.sub}</span>}
                      </span>
                    </span>
                    <span className={cn("pt-0.5 font-mono text-sm whitespace-nowrap", l.tipo === "receita" ? "text-success" : "text-destructive")}>
                      {l.tipo === "receita" ? "+" : "−"}
                      {brlC(l.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
