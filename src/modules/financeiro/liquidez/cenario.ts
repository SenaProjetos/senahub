/**
 * Cenário do planejador em dois eixos (entradas × compromissos). Os botões rápidos só preenchem os
 * eixos; qualquer outra combinação é "Personalizado". Puro.
 */
import type { Confianca, EventoCaixa, Prioridade } from "@/modules/financeiro/liquidez/tipos";

export type EixoEntradas = "confirmadas" | "provaveis" | "estimadas" | "todas";
export type EixoCompromissos = "todos" | "p1p2" | "p1";
export type Eixos = { entradas: EixoEntradas; compromissos: EixoCompromissos };

export const CONFIANCAS_DO_EIXO: Record<EixoEntradas, readonly Confianca[]> = {
  confirmadas: ["confirmada_cliente"],
  provaveis: ["confirmada_cliente", "provavel"],
  estimadas: ["confirmada_cliente", "provavel", "estimada"],
  todas: ["confirmada_cliente", "provavel", "estimada", "incerta"],
};

export const PRIORIDADES_DO_EIXO: Record<EixoCompromissos, readonly Prioridade[]> = {
  todos: ["p1", "p2", "p3", "p4"],
  p1p2: ["p1", "p2"],
  p1: ["p1"],
};

export type PresetId = "conservador" | "provavel" | "so_p1" | "p1_p2";

export const PRESETS: readonly { id: PresetId; nome: string; eixos: Eixos }[] = [
  { id: "conservador", nome: "Conservador", eixos: { entradas: "confirmadas", compromissos: "todos" } },
  { id: "provavel", nome: "Provável", eixos: { entradas: "provaveis", compromissos: "todos" } },
  { id: "so_p1", nome: "Só P1", eixos: { entradas: "provaveis", compromissos: "p1" } },
  { id: "p1_p2", nome: "P1 + P2", eixos: { entradas: "provaveis", compromissos: "p1p2" } },
];

export const EIXOS_PADRAO: Eixos = { entradas: "provaveis", compromissos: "todos" };

export function presetDosEixos(e: Eixos): PresetId | "personalizado" {
  const p = PRESETS.find((x) => x.eixos.entradas === e.entradas && x.eixos.compromissos === e.compromissos);
  return p ? p.id : "personalizado";
}

/**
 * O evento entra no cenário? Perna de transferência entra sempre: ela não é entrada nem
 * compromisso, e tirá-la faria o dinheiro sumir da projeção (spec §2).
 */
export function eventoNoCenario(e: Pick<EventoCaixa, "tipo" | "natureza" | "confianca" | "prioridade">, eixos: Eixos): boolean {
  if (e.natureza === "transferencia") return true;
  if (e.tipo === "receita") return e.confianca != null && CONFIANCAS_DO_EIXO[eixos.entradas].includes(e.confianca);
  return PRIORIDADES_DO_EIXO[eixos.compromissos].includes(e.prioridade ?? "p3");
}
