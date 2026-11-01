"use client";

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { agruparPorRegra, contarPorSeveridade, type Achado } from "@/modules/planejamento/qualidade";
import { motivoDaBaseline, rotuloBaseline, type VersaoBaseline } from "@/modules/planejamento/baselines";
import { MOTIVO_PLANO_TRAVADO } from "@/modules/planejamento/trava-plano";
import { formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const REGRA_LABEL: Record<string, string> = {
  sem_responsavel: "sem responsável",
  sem_duracao: "sem duração",
  sem_predecessora: "sem predecessora",
  sem_sucessora: "sem sucessora",
  atrasada: "atrasada",
  critica_atrasada: "crítica atrasada",
  bloqueada: "bloqueada",
  duracao_excessiva: "duração excessiva",
  marco_com_duracao: "marco com duração",
  vinculo_circular: "dependência circular",
  concluida_sem_termino_real: "concluída sem término real",
  iniciada_sem_inicio_real: "iniciada sem início real",
  futura_com_avanco: "futura com avanço",
  excesso_de_restricoes: "excesso de restrições",
  sem_data_status: "sem Data de Status",
  atribuicao_sem_horas: "sem horas previstas",
  atribuicao_em_resumo: "agrupamento com gente atribuída",
  disciplina_diferente_do_agrupamento: "disciplina diferente do agrupamento",
};

export const FAIXA_COR: Record<string, string> = {
  saudavel: "text-success border-success/40",
  atencao: "text-warning border-warning/40",
  critico: "text-destructive border-destructive/40",
};

export const rotuloFaixa = (faixa: string) => (faixa === "saudavel" ? "saudável" : faixa === "atencao" ? "atenção" : "crítico");

export const iconeDaFaixa = (faixa: string | null) => (faixa === "saudavel" ? ShieldCheck : faixa === "critico" ? ShieldAlert : ShieldQuestion);

/** Linha de base × plano de hoje (o antigo bloco do topo da tela): quantas linhas no prazo, adiantadas e atrasadas. */
export type ComparativoBase = {
  rotulo: string;
  total: number;
  noPrazo: number;
  adiantadas: number;
  atrasadas: number;
  /** Média de dias de atraso das atrasadas. */
  mediaAtraso: number;
};

/**
 * Painel lateral "Saúde do cronograma" (mock aprovado em 2026-10-23): abre pelo resumo da faixa de status. Junta a nota, os
 * achados do verificador (agrupados por regra, com "Ver na tabela" e a correção da disciplina), o comparativo com a linha de
 * base e as versões dela — o que antes ocupava três blocos fixos no topo da tela.
 */
export function SaudeCronogramaPainel({
  aberto,
  onAbertoChange,
  achados,
  nota,
  faixa,
  provisoria,
  comparativo,
  versoes,
  podeCorrigirDisciplina,
  planoTravado,
  pendente,
  onCorrigirDisciplina,
  onVerNaTabela,
}: {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  achados: Achado[];
  nota: number | null;
  faixa: string | null;
  provisoria: boolean;
  comparativo: ComparativoBase | null;
  versoes: VersaoBaseline[];
  /** `planejamento:gerir` — o botão que corrige a disciplina das linhas. */
  podeCorrigirDisciplina: boolean;
  planoTravado: boolean;
  pendente: boolean;
  onCorrigirDisciplina: (tarefaIds: string[]) => void;
  /** Filtra a tabela nas linhas do achado (só os que apontam linhas). */
  onVerNaTabela: (rotulo: string, tarefaIds: string[]) => void;
}) {
  const contagem = contarPorSeveridade(achados);
  const agrupados = [...agruparPorRegra(achados).entries()];
  const Icone = iconeDaFaixa(faixa);

  return (
    <Sheet open={aberto} onOpenChange={onAbertoChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-8 text-base font-bold">Saúde do cronograma</SheetTitle>
          <SheetDescription className="sr-only">Nota, achados do verificador e linha de base do cronograma.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-4 text-sm">
          <div className="flex items-center gap-3">
            <Icone className={`size-9 shrink-0 ${faixa ? FAIXA_COR[faixa]?.split(" ")[0] : "text-muted-foreground"}`} aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-2xl font-bold tabular-nums">{nota ?? "—"}%</span>
                {faixa && (
                  <Badge variant="outline" className={FAIXA_COR[faixa]}>
                    {rotuloFaixa(faixa)}
                  </Badge>
                )}
                {provisoria && (
                  <Badge variant="outline" className="text-muted-foreground" title="Metodologia ainda não oficializada — pesos podem mudar conforme calibração com projetos reais">
                    provisória
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">
                {contagem.erro} erro(s) · {contagem.alerta} alerta(s) · {contagem.info} aviso(s).
                {contagem.erro > 0 && " Com erro aberto o cronograma não pode ser aprovado."}
              </p>
            </div>
          </div>

          <section className="space-y-1.5">
            <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Achados do verificador</h3>
            {agrupados.length === 0 ? (
              <p className="rounded-sm border border-dashed px-3 py-2 text-muted-foreground">Nenhum achado. O cronograma passou em todas as regras.</p>
            ) : (
              <ul className="space-y-1.5">
                {agrupados.map(([regra, lista]) => {
                  const ids = lista.flatMap((a) => (a.tarefaId ? [a.tarefaId] : []));
                  const rotulo = REGRA_LABEL[regra] ?? regra;
                  const sev = lista[0].severidade;
                  return (
                    <li
                      key={regra}
                      className={`flex flex-wrap items-center gap-2 rounded-sm border px-2.5 py-2 ${
                        sev === "erro" ? "border-destructive/40 bg-destructive/5" : sev === "alerta" ? "border-warning/40 bg-warning/5" : ""
                      }`}
                    >
                      <Badge
                        variant="outline"
                        className={sev === "erro" ? "border-destructive/40 text-destructive" : sev === "alerta" ? "border-warning/40 text-warning" : "text-muted-foreground"}
                      >
                        {lista.length}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        {rotulo}
                        <span className="sr-only"> — {sev === "erro" ? "erro" : sev === "alerta" ? "alerta" : "aviso"}</span>
                      </span>
                      {regra === "disciplina_diferente_do_agrupamento" && podeCorrigirDisciplina && (
                        // O motivo vai no <span>: o botão desabilitado não recebe o mouse e o `title` dele nunca apareceria.
                        <span title={planoTravado ? MOTIVO_PLANO_TRAVADO : undefined}>
                          <Button size="sm" variant="outline" disabled={pendente || planoTravado} onClick={() => onCorrigirDisciplina(ids)}>
                            Usar a do agrupamento
                          </Button>
                        </span>
                      )}
                      {ids.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-info underline-offset-2 hover:underline"
                          onClick={() => onVerNaTabela(rotulo, ids)}
                          aria-label={`Ver na tabela as linhas: ${rotulo}`}
                        >
                          Ver na tabela
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Linha de base</h3>
            {versoes.length === 0 ? (
              <p className="rounded-sm border border-dashed px-3 py-2 text-muted-foreground">
                Ainda não há linha de base. A primeira (BL-00) é gravada ao aprovar o cronograma; depois cada revisão gera uma nova,
                sem apagar as anteriores.
              </p>
            ) : (
              <>
                {comparativo && (
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="rounded-sm border px-1 py-2">
                      <div className="text-lg font-bold tabular-nums">{comparativo.total}</div>
                      <div className="text-[11px] text-muted-foreground">com {comparativo.rotulo}</div>
                    </div>
                    <div className="rounded-sm border px-1 py-2">
                      <div className="text-lg font-bold tabular-nums text-success">{comparativo.noPrazo}</div>
                      <div className="text-[11px] text-muted-foreground">no prazo</div>
                    </div>
                    <div className="rounded-sm border px-1 py-2">
                      <div className="text-lg font-bold tabular-nums text-primary">{comparativo.adiantadas}</div>
                      <div className="text-[11px] text-muted-foreground">adiantada(s)</div>
                    </div>
                    <div className="rounded-sm border px-1 py-2">
                      <div className={`text-lg font-bold tabular-nums ${comparativo.atrasadas > 0 ? "text-destructive" : ""}`}>{comparativo.atrasadas}</div>
                      <div className="text-[11px] text-muted-foreground">
                        atrasada(s){comparativo.mediaAtraso > 0 ? ` · +${comparativo.mediaAtraso}d` : ""}
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Cada versão é uma foto do cronograma. Nenhuma é sobrescrita: escolha qual comparar no Gantt de Controle.
                </p>
                <ul className="divide-y rounded-sm border">
                  {versoes.map((v, i) => (
                    <li key={v.numero} className="space-y-0.5 px-3 py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs font-semibold">{rotuloBaseline(v.numero)}</span>
                        <span className="min-w-0 flex-1">{motivoDaBaseline(v)}</span>
                        {i === 0 && (
                          <Badge variant="outline" className="border-info/40 text-info">
                            atual
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatarData(v.criadaEm)}
                        {v.autor ? ` · ${v.autor}` : ""} · {v.linhas} linha(s)
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
