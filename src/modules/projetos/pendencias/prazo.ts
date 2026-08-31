/**
 * Prazo/SLA do apontamento (item 18) — puro, sem I/O, no molde de `marcacao.ts`/`medicao.ts`.
 *
 * **O relógio corre a partir de `publicadoEm`, não de `createdAt`.** Enquanto o apontamento é
 * rascunho (item 31) ele existe só para quem escreveu — cobrar prazo de alguém que ainda não
 * pode ver o problema não é SLA, é armadilha. Um apontamento criado na segunda e entregue na
 * quinta começa a contar na quinta.
 *
 * O prazo é uma DATA FIXA definida na criação (R8), não derivada de severidade: não existe
 * tabela de regra, e mudar a severidade depois não mexe no prazo.
 */

import { inicioDoDia as inicioDoDiaData } from "@/lib/data";

export const SITUACOES_PRAZO = ["sem_prazo", "no_prazo", "vence_em_breve", "vencido"] as const;
export type SituacaoPrazo = (typeof SITUACOES_PRAZO)[number];

export const SITUACAO_PRAZO_LABEL: Record<SituacaoPrazo, string> = {
  sem_prazo: "Sem prazo",
  no_prazo: "No prazo",
  vence_em_breve: "Vence em breve",
  vencido: "Vencido",
};

/** Dias de antecedência a partir dos quais o prazo já é "vence em breve". */
export const DIAS_ALERTA = 3;

const DIA_MS = 86_400_000;

/**
 * Meia-noite local em ms — comparar prazo por DIA, não por hora: prazo é data.
 * Passa por `lib/data.ts` porque o banco devolve a data em meia-noite UTC e os
 * getters locais recuavam um dia em America/Sao_Paulo.
 */
function inicioDoDia(d: Date | string): number {
  return (inicioDoDiaData(d) ?? new Date(NaN)).getTime();
}

/**
 * Dias inteiros até o prazo (negativo = atrasado). `null` quando não há prazo ou quando o
 * apontamento ainda é rascunho — nesse caso o relógio nem começou.
 */
export function diasAtePrazo(
  prazo: Date | string | null | undefined,
  publicadoEm: Date | string | null | undefined,
  hoje: Date = new Date(),
): number | null {
  if (!prazo || !publicadoEm) return null;
  const p = new Date(prazo);
  if (Number.isNaN(p.getTime())) return null;
  return Math.round((inicioDoDia(p) - inicioDoDia(hoje)) / DIA_MS);
}

/**
 * Situação do prazo. Estado ENCERRADO nunca aparece como vencido: cobrar SLA de algo já
 * fechado ou marcado como não procede seria ruído — o trabalho acabou.
 */
export function situacaoPrazo(
  p: {
    prazo: Date | string | null;
    publicadoEm: Date | string | null;
    status: string;
  },
  encerrados: readonly string[],
  hoje: Date = new Date(),
): SituacaoPrazo {
  if (encerrados.includes(p.status)) return "sem_prazo";
  const dias = diasAtePrazo(p.prazo, p.publicadoEm, hoje);
  if (dias === null) return "sem_prazo";
  if (dias < 0) return "vencido";
  if (dias <= DIAS_ALERTA) return "vence_em_breve";
  return "no_prazo";
}

/** Texto curto pra badge: "vence hoje", "há 3 dias", "em 5 dias". */
export function rotuloPrazo(dias: number | null): string {
  if (dias === null) return "—";
  if (dias === 0) return "vence hoje";
  if (dias < 0) return `atrasado há ${Math.abs(dias)} dia(s)`;
  return `em ${dias} dia(s)`;
}

/**
 * Agrupa apontamentos por destinatário para UMA notificação por pessoa (a "notificação
 * agrupada" que a ficha pede). Sem isso, uma prancha com 12 apontamentos vencidos viraria 12
 * pushes — que é a forma mais rápida de a pessoa desligar a categoria inteira.
 */
export function agruparPorDestinatario<T>(
  itens: readonly { item: T; destinatarios: readonly string[] }[],
): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const { item, destinatarios } of itens) {
    for (const d of new Set(destinatarios)) {
      const lista = mapa.get(d);
      if (lista) lista.push(item);
      else mapa.set(d, [item]);
    }
  }
  return mapa;
}
