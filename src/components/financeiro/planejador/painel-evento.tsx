"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Valor } from "@/components/financeiro/valor";
import { brlC, brlCSinal, rotuloDia } from "@/components/financeiro/planejador/formato";
import { ROTULOS_CONFIANCA, ROTULOS_PRIORIDADE } from "@/modules/financeiro/planejador/acoes";
import { podeSimularData } from "@/modules/financeiro/liquidez/simulacao";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import type { EventoProjetado } from "@/modules/financeiro/liquidez/motor";
import type { Confianca, DataIso, EventoCaixa, Prioridade } from "@/modules/financeiro/liquidez/tipos";

const SEM_CAIXINHA = "__sem_caixinha";

const SITUACAO: Record<string, string> = {
  previsto: "Em aberto",
  aguardando_aprovacao: "Aguardando aprovação",
  previsao: "Previsão do cronograma",
};

/**
 * Painel lateral de um movimento (mockup "Planejador"): dados, impacto no caixa do dia e a
 * simulação de outra data com PRÉVIA do menor saldo antes de simular. Tudo aqui mexe só na
 * simulação.
 */
export function PainelEvento({
  evento,
  projetado,
  noCenario,
  hoje,
  fim,
  menorSaldoAtual,
  previaDoMenorSaldo,
  focarData,
  onFechar,
  onSimularData,
  onAlternar,
  onPrioridade,
  onConfianca,
  caixinhas,
  onCaixinha,
}: {
  evento: EventoCaixa | null;
  projetado: EventoProjetado | null;
  noCenario: boolean;
  hoje: DataIso;
  fim: DataIso;
  menorSaldoAtual: number;
  previaDoMenorSaldo: (data: DataIso) => number | null;
  focarData: boolean;
  onFechar: () => void;
  onSimularData: (data: DataIso) => void;
  onAlternar: () => void;
  onPrioridade: (p: Prioridade) => void;
  onConfianca: (c: Confianca) => void;
  /** Caixinhas ativas; vazio esconde o campo. `null` = tirar da caixinha. */
  caixinhas: readonly { id: string; nome: string }[];
  onCaixinha: (id: string | null) => void;
}) {
  const [data, setData] = useState<DataIso>("");
  useEffect(() => {
    setData(evento?.data ?? "");
  }, [evento?.id, evento?.data]);

  const aberto = evento !== null;
  const e = evento;
  const previa = e && data && data !== e.data && data >= hoje && data <= fim ? previaDoMenorSaldo(data) : null;
  const excluido = e?.simulacao?.excluido === true;
  const forcado = e?.simulacao?.forcado === true;
  const rotuloAlternar = !e
    ? ""
    : e.origem === "simulado"
      ? "Remover da simulação"
      : excluido
        ? "Voltar para a simulação"
        : !noCenario && !forcado
          ? "Incluir nesta simulação"
          : "Tirar da simulação";

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {e && (
          <>
            <SheetHeader className="pr-10">
              <SheetTitle className="text-lg">{e.descricao}</SheetTitle>
              <SheetDescription>{[e.favorecido, e.projeto].filter(Boolean).join(" · ") || "Movimento pendente"}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              <Valor valor={(e.tipo === "receita" ? e.valor : -e.valor) / 100} className="text-3xl font-semibold" />

              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13.5px]">
                <dt className="text-muted-foreground">Data</dt>
                <dd>
                  {rotuloDia(e.data)}
                  {e.simulacao?.dataOriginal && <span className="text-muted-foreground"> (simulado; era {diaMes(e.simulacao.dataOriginal)})</span>}
                  {e.vencido && <span className="text-destructive"> · vencido</span>}
                </dd>
                <dt className="text-muted-foreground">Categoria</dt>
                <dd>{e.categoriaNome ?? "—"}</dd>
                <dt className="text-muted-foreground">Situação</dt>
                <dd>{e.origem === "simulado" ? "Só na simulação" : e.status ? SITUACAO[e.status] : "—"}</dd>
              </dl>

              {e.origem !== "simulado" && e.natureza !== "transferencia" && e.tipo === "despesa" && e.prioridade && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pe-prioridade">Prioridade nesta simulação</Label>
                  <Select value={e.prioridade} onValueChange={(v) => v && onPrioridade(v as Prioridade)}>
                    <SelectTrigger id="pe-prioridade" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROTULOS_PRIORIDADE) as Prioridade[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {ROTULOS_PRIORIDADE[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {e.origem !== "simulado" && e.natureza !== "transferencia" && e.tipo === "despesa" && caixinhas.length > 0 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pe-caixinha">Paga pela caixinha nesta simulação</Label>
                  <Select value={e.caixinhaId ?? SEM_CAIXINHA} onValueChange={(v) => onCaixinha(!v || v === SEM_CAIXINHA ? null : v)}>
                    <SelectTrigger id="pe-caixinha" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_CAIXINHA}>Nenhuma</SelectItem>
                      {caixinhas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">O que a caixinha cobre sai do reservado, não do dinheiro livre.</p>
                </div>
              )}
              {e.origem !== "simulado" && e.natureza !== "transferencia" && e.tipo === "receita" && e.confianca && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pe-confianca">Confiança nesta simulação</Label>
                  <Select value={e.confianca} onValueChange={(v) => v && onConfianca(v as Confianca)}>
                    <SelectTrigger id="pe-confianca" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROTULOS_CONFIANCA) as Confianca[]).map((c) => (
                        <SelectItem key={c} value={c}>
                          {ROTULOS_CONFIANCA[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <section aria-labelledby="pe-impacto" className="flex flex-col gap-1.5 rounded-sm border p-3 text-[13.5px]">
                <h3 id="pe-impacto" className="font-bold">Impacto no caixa</h3>
                {projetado?.aplicado ? (
                  <>
                    <p className="flex justify-between"><span>Caixa antes</span><span className="font-mono">{brlC(projetado.caixaAntes ?? 0)}</span></p>
                    <p className="flex justify-between"><span>Caixa depois</span><span className="font-mono">{brlC(projetado.caixaDepois ?? 0)}</span></p>
                    <p className="text-[13px] text-muted-foreground">
                      {e.natureza === "transferencia"
                        ? "Transferência entre contas: muda o saldo do dia, mas não é entrada nem compromisso."
                        : projetado.impactoPercentual === null
                          ? "Caixa zerado ou negativo antes deste movimento: o percentual não se aplica."
                          : `${e.tipo === "receita" ? "Aumenta o caixa em" : "Consome"} ${projetado.impactoPercentual.toLocaleString("pt-BR")}% do caixa do dia.`}
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    {excluido ? "Tirado desta simulação: não mexe no saldo." : "Fora do cenário escolhido: não mexe no saldo. Use “Incluir nesta simulação” para testar."}
                  </p>
                )}
              </section>

              <section aria-labelledby="pe-data" className="flex flex-col gap-2.5 rounded-sm border p-3 text-[13.5px]">
                <h3 id="pe-data" className="font-bold">Simular outra data</h3>
                {podeSimularData(e) ? (
                  <>
                    <div className="flex items-end gap-2">
                      <div className="grid flex-1 gap-1.5">
                        <Label htmlFor="pe-nova-data">Nova data</Label>
                        <Input id="pe-nova-data" type="date" min={hoje} max={fim} value={data} autoFocus={focarData} onChange={(ev) => setData(ev.target.value)} />
                      </div>
                      <Button onClick={() => data && onSimularData(data)} disabled={!data || data === e.data || data < hoje || data > fim}>
                        Simular
                      </Button>
                    </div>
                    {previa !== null && (
                      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-[13px]">
                        <dt>Menor saldo agora</dt>
                        <dd className="text-right font-mono">{brlC(menorSaldoAtual)}</dd>
                        <dt>Menor saldo com a nova data</dt>
                        <dd className="text-right font-mono">{brlC(previa)}</dd>
                        <dt className="font-bold">Variação</dt>
                        <dd className="text-right font-mono font-bold">{brlCSinal(previa - menorSaldoAtual)}</dd>
                      </dl>
                    )}
                    {e.status === "previsao" && (
                      <p className="text-xs text-muted-foreground">A data real desta previsão segue o marco do cronograma: dá para simular, não para aplicar.</p>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">{e.naoProgramavel}</p>
                )}
              </section>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onAlternar}>
                  {rotuloAlternar}
                </Button>
                {e.origem === "lancamento" && (
                  <Button variant="ghost" render={<Link href={`/financeiro/lancamentos?lancamento=${encodeURIComponent(e.id)}`} />}>
                    <ExternalLink className="size-4" aria-hidden /> Abrir lançamento
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
