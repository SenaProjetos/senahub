/**
 * Lançamento pendente → evento do motor (spec §1, §3). Puro.
 *
 * Invariante: só PENDENTE vira evento. Realizado já está no caixa atual e nunca volta a ser
 * contado; cancelado e excluído não existem para o planejador.
 */
import { diasEntre } from "@/modules/financeiro/liquidez/datas";
import type {
  Confianca,
  DataIso,
  EventoCaixa,
  LancamentoEntrada,
  Observado,
  Prioridade,
  StatusLancamento,
  StatusPendente,
} from "@/modules/financeiro/liquidez/tipos";

export const STATUS_PENDENTES: readonly StatusPendente[] = ["previsto", "aguardando_aprovacao", "previsao"];

export function ehPendente(status: StatusLancamento): status is StatusPendente {
  return (STATUS_PENDENTES as readonly string[]).includes(status);
}

/** Data em que o movimento cai: `vencimento ?? data`. */
export function dataDoEvento(l: Pick<LancamentoEntrada, "vencimento" | "data">): DataIso {
  return l.vencimento ?? l.data;
}

/** Só despesa tem prioridade: do lançamento, senão da categoria, senão da categoria-pai, senão P3. */
export function prioridadeEfetiva(l: Pick<LancamentoEntrada, "tipo" | "prioridade" | "categoria">): Prioridade | null {
  if (l.tipo !== "despesa") return null;
  return l.prioridade ?? l.categoria.prioridadePadrao ?? l.categoria.prioridadePadraoPai ?? "p3";
}

/**
 * Só receita pendente tem confiança: a gravada, senão o padrão do status (D1: faturada = provável;
 * previsão do cronograma = estimada). Vencida há mais de `diasParaIncerta` conta como incerta NA
 * PROJEÇÃO — nada é gravado.
 */
export function confiancaEfetiva(
  l: Pick<LancamentoEntrada, "tipo" | "status" | "confianca" | "vencimento" | "data">,
  hoje: DataIso,
  diasParaIncerta: number,
): Confianca | null {
  if (l.tipo !== "receita" || !ehPendente(l.status)) return null;
  const base: Confianca = l.confianca ?? (l.status === "previsao" ? "estimada" : "provavel");
  const atraso = diasEntre(dataDoEvento(l), hoje);
  return atraso > diasParaIncerta ? "incerta" : base;
}

export const MOTIVO_PREVISAO = "A data segue o marco do cronograma.";
export const MOTIVO_ART = "A data da taxa segue a ART.";
export const MOTIVO_APROVACAO = "Aguardando aprovação: a data muda depois de aprovada.";
export const MOTIVO_P1 = "P1 não pode atrasar: salário e imposto têm prazo.";

/** Por que a data não pode ser reprogramada (`null` = pode). Mesma frase que o servidor devolverá. */
export function motivoNaoProgramavel(
  l: Pick<LancamentoEntrada, "status" | "ehTaxaArt">,
  prioridade: Prioridade | null,
): string | null {
  if (l.status === "previsao") return MOTIVO_PREVISAO;
  if (l.ehTaxaArt) return MOTIVO_ART;
  if (l.status === "aguardando_aprovacao") return MOTIVO_APROVACAO;
  if (prioridade === "p1") return MOTIVO_P1;
  return null;
}

/** Foto dos campos observados (spec §6), com os valores gravados — não os efetivos. */
export function observadoDe(
  l: Pick<LancamentoEntrada, "status" | "excluido" | "vencimento" | "data" | "valor" | "prioridade" | "confianca" | "caixinhaId">,
): Observado {
  return {
    status: l.status,
    excluido: l.excluido === true,
    data: dataDoEvento(l),
    valor: l.valor,
    prioridade: l.prioridade,
    confianca: l.confianca,
    caixinhaId: l.caixinhaId ?? null,
  };
}

export type OpcoesEventos = { hoje: DataIso; diasParaIncerta: number };

/** Converte a lista da consulta em eventos. Descarta tudo que não é pendente vivo. */
export function paraEventos(lancamentos: readonly LancamentoEntrada[], o: OpcoesEventos): EventoCaixa[] {
  const eventos: EventoCaixa[] = [];
  for (const l of lancamentos) {
    if (l.excluido || !ehPendente(l.status)) continue;
    if (!(l.valor > 0)) continue;
    const data = dataDoEvento(l);
    const prioridade = prioridadeEfetiva(l);
    eventos.push({
      id: l.id,
      origem: "lancamento",
      tipo: l.tipo,
      natureza: l.categoria.natureza,
      valor: l.valor,
      data,
      vencido: data < o.hoje,
      descricao: l.descricao,
      favorecido: l.favorecido ?? null,
      projeto: l.projeto ?? null,
      categoriaNome: l.categoriaNome ?? null,
      status: l.status,
      prioridade,
      confianca: confiancaEfetiva(l, o.hoje, o.diasParaIncerta),
      caixinhaId: l.tipo === "despesa" ? (l.caixinhaId ?? null) : null,
      naoProgramavel: motivoNaoProgramavel(l, prioridade),
      transferencia:
        l.categoria.natureza === "transferencia"
          ? { id: l.transferencia?.id ?? null, contrapartes: [...(l.transferencia?.contrapartes ?? [])] }
          : null,
      observado: observadoDe(l),
    });
  }
  return eventos;
}
