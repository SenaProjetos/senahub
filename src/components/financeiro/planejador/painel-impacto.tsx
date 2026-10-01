"use client";

import { Button } from "@/components/ui/button";
import { Valor } from "@/components/financeiro/valor";
import { brlC } from "@/components/financeiro/planejador/formato";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import type { Projecao } from "@/modules/financeiro/liquidez/motor";
import { cn } from "@/lib/utils";

/**
 * "Impacto da programação" (spec §16): dois blocos que nunca se misturam numa conta só.
 *  Hoje:     caixa − reservado = livre (+ reservas descobertas)
 *  O operador fica no rótulo e o valor sem sinal, como no exemplo do dono ("− Reservado R$ 40.000");
 *  só o que tem direção própria (transferências, margens, variação) leva o sinal no valor.
 *  Projeção: caixa + entradas − compromissos (cobertos já estão dentro) ± transferências = saldo
 * Com ajustes, o antes × depois do menor saldo e do saldo final, e a lista do que foi simulado.
 */

function Linha({ rotulo, valor, forte, recuo, sentido = "neutro", className }: { rotulo: string; valor: number; forte?: boolean; recuo?: boolean; sentido?: "auto" | "neutro"; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-[13.5px]", forte && "font-bold", recuo && "pl-3 text-[13px] text-muted-foreground", className)}>
      <span>{rotulo}</span>
      <Valor valor={valor / 100} sentido={sentido} />
    </div>
  );
}

export type ItemAjuste = {
  chave: string;
  texto: string;
  onDesfazer: () => void;
  /** Cenário salvo aberto depois que o real mudou (spec §11): continua simulado, mas não aplica. */
  aviso?: string | null;
};

export function PainelImpacto({
  projecao,
  antes,
  reservaMinima,
  ajustes,
  semAlvo,
  onDescartar,
  onSalvar,
  onAplicar,
  nota = "A simulação fica guardada nesta aba do navegador e não muda o financeiro.",
  className,
}: {
  projecao: Projecao;
  antes: Projecao | null;
  reservaMinima: number;
  ajustes: ItemAjuste[];
  semAlvo: number;
  onDescartar: () => void;
  /** Ausente = quem vê não pode salvar (sócio que só lê). */
  onSalvar?: () => void;
  /** Ausente = sem `financeiro:gerir`. */
  onAplicar?: () => void;
  nota?: string;
  className?: string;
}) {
  const h = projecao.hoje;
  const f = projecao.fimDoHorizonte;
  const t = projecao.totais;
  const fim = diaMes(projecao.fim);
  // `Dsc` (spec §4) também absorve saldo negativo para manter S = R + L − Dsc. Na tela, "reservas
  // descobertas" é só a parte das caixinhas sem dinheiro por trás; o resto é déficit, que tem aviso próprio.
  const descobertoHoje = Math.min(h.descoberto, h.reservado);
  const descobertoFim = Math.min(f.descoberto, f.reservado);

  return (
    <aside aria-labelledby="impacto-t" className={cn("flex flex-col gap-2 rounded-sm border border-l-[3px] border-l-primary bg-card p-4 shadow-[var(--card-shadow)]", className)}>
      <h2 id="impacto-t" className="text-[15px] font-bold">Impacto da programação</h2>

      <p className="text-[12.5px] font-bold text-muted-foreground">Hoje</p>
      <Linha rotulo="Caixa atual, nas contas" valor={h.caixa} />
      <Linha rotulo="− Reservado em caixinhas" valor={h.reservado} />
      <Linha rotulo="= Dinheiro livre hoje" valor={h.livre} forte />
      {descobertoHoje > 0 && <Linha rotulo="Reservas descobertas" valor={descobertoHoje} className="text-destructive" />}

      <div className="my-1 h-px bg-border" />
      <p className="text-[12.5px] font-bold text-muted-foreground">Projeção até {fim}</p>
      <Linha rotulo="Caixa atual" valor={h.caixa} />
      <Linha rotulo="+ Entradas" valor={t.entradas} />
      <Linha rotulo="− Compromissos" valor={t.compromissos} />
      <Linha rotulo="cobertos por caixinha, já estão acima" valor={t.cobertos} recuo />
      <Linha rotulo="sem cobertura" valor={t.semCobertura} recuo />
      {t.transferencias !== 0 && <Linha rotulo="± Transferências entre contas (líquido)" valor={t.transferencias} sentido="auto" />}
      <Linha rotulo={`= Saldo projetado em ${fim}`} valor={f.caixa} forte />
      <Linha rotulo="Reserva mínima (compara com o saldo)" valor={reservaMinima} className="text-muted-foreground" />
      <Linha rotulo="Margem até a reserva no fim" valor={projecao.margemFim} sentido="auto" />
      <Linha rotulo={`No pior dia (${diaMes(projecao.menorSaldo.dia)})`} valor={projecao.margemPiorDia} sentido="auto" />
      <Linha rotulo={`Livre projetado em ${fim}`} valor={f.livre} />
      {descobertoFim > 0 && (
        <p role="status" className="rounded-sm border border-destructive/50 bg-destructive/5 px-2.5 py-2 text-[13px]">
          <b>Reservas descobertas: {brlC(descobertoFim)}.</b> As caixinhas somam mais do que o saldo projetado.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Livre projetado = livre hoje + entradas − compromissos sem cobertura. A caixinha usada não sai duas vezes.</p>

      {antes && (
        <div className="mt-1 rounded-sm border">
          {/* Resumo em reais inteiros (como o mock): com centavos as quatro colunas não cabem em 360 px.
              O valor exato está no painel acima e na agenda. */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] tracking-tight">
              <caption className="sr-only">Antes e depois dos ajustes, em reais inteiros</caption>
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="pl-3 pt-2 text-left font-normal"><span className="sr-only">Indicador</span></th>
                  <th scope="col" className="px-1 pt-2 text-right font-normal">Antes</th>
                  <th scope="col" className="px-1 pt-2 text-right font-normal">Depois</th>
                  <th scope="col" className="pr-3 pl-1 pt-2 text-right font-normal">Variação</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { rotulo: "Menor saldo", a: antes.menorSaldo.valor, d: projecao.menorSaldo.valor },
                  { rotulo: "Saldo final", a: antes.fimDoHorizonte.caixa, d: f.caixa },
                ].map((r) => (
                  <tr key={r.rotulo}>
                    <th scope="row" className="pl-3 py-1 text-left font-normal leading-tight">{r.rotulo}</th>
                    <td className="whitespace-nowrap px-1 py-1 text-right"><Valor valor={r.a / 100} sentido="neutro" inteiro /></td>
                    <td className="whitespace-nowrap px-1 py-1 text-right"><Valor valor={r.d / 100} sentido="neutro" inteiro /></td>
                    <td className="whitespace-nowrap pr-3 pl-1 py-1 text-right font-bold"><Valor valor={(r.d - r.a) / 100} inteiro /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-1 border-t px-3 py-2">
            <p className="text-[13px] font-semibold">Ajustes nesta simulação ({ajustes.length})</p>
            {ajustes.map((a) => (
              <div key={a.chave} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0">
                  {a.texto}
                  {a.aviso && <span className="block text-xs text-warning">Mudou no financeiro: {a.aviso}.</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={a.onDesfazer} aria-label={`Desfazer: ${a.texto}`}>
                  Desfazer
                </Button>
              </div>
            ))}
            {semAlvo > 0 && (
              <p className="text-xs text-warning">
                {semAlvo} {semAlvo === 1 ? "ajuste ficou" : "ajustes ficaram"} sem o movimento: ele foi pago, cancelado ou saiu do horizonte.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
            <Button size="sm" variant="outline" onClick={onDescartar}>
              Descartar
            </Button>
            {onSalvar && (
              <Button size="sm" variant="outline" onClick={onSalvar}>
                Salvar cenário
              </Button>
            )}
            {onAplicar && (
              <Button size="sm" className="ml-auto" onClick={onAplicar}>
                Aplicar ao financeiro
              </Button>
            )}
          </div>
        </div>
      )}
      {!antes && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          Mude a data de um pagamento, tire uma entrada ou simule uma distribuição de lucros: o antes e depois aparece aqui.
        </p>
      )}
      <p className="text-xs text-muted-foreground">{nota}</p>
    </aside>
  );
}
