/**
 * O REALIZADO de cada linha da EAP (Lote 7): duração real e restante, trabalho e custo reais, e a
 * variação em dias contra a linha de base. Puro, sem I/O — a leitura fica em `queries.ts`.
 *
 * Diferente do custo PREVISTO (`custo.ts`, "desconhecido nunca vira zero" porque é orçamento), o
 * realizado é acompanhamento: soma o que sabe e marca `parcial` quando falta a taxa de alguém, em vez
 * de esconder o número inteiro.
 */
import type { StatusEap } from "@/generated/prisma/client";
import { diasUteisEntre, type Calendario, type Dia } from "@/lib/calendario-trabalho";
import { diasEntre } from "@/lib/dias-iso";

/** Um número realizado e se ele está incompleto. `valor: null` = não se mede (a tela mostra "—"). */
export type ValorReal = { valor: number | null; parcial: boolean };

const FORA_DA_EXECUCAO = new Set<StatusEap>(["sus", "can", "arq"]);
const centesimos = (v: number) => Math.round(v * 100);

/** Dias úteis do início real até o término real (ou hoje, se ainda não terminou). */
export function duracaoReal(
  p: { marco: boolean; inicioReal: Dia | null; fimReal: Dia | null; hoje: Dia },
  cal: Calendario,
): number | null {
  if (p.marco || !p.inicioReal) return null;
  return diasUteisEntre(p.inicioReal, p.fimReal ?? p.hoje, cal);
}

/** Dias úteis de hoje até o término previsto pelo motor; 0 quando concluída ou já vencida. */
export function duracaoRestante(
  p: { marco: boolean; status: StatusEap; progresso: number; fimPrevisto: Dia; hoje: Dia },
  cal: Calendario,
): number | null {
  if (p.marco || FORA_DA_EXECUCAO.has(p.status)) return null;
  if (p.status === "con" || p.progresso >= 100) return 0;
  return diasUteisEntre(p.hoje, p.fimPrevisto, cal);
}

/**
 * Terceiro: o valor digitado. Interna: horas apontadas × custo/hora de cada pessoa — um valor de
 * terceiro que sobrou de quando a linha era de terceiro é ignorado.
 */
export function custoRealDaFolha(p: {
  deTerceiro: boolean;
  custoRealTerceiro: number | null;
  minutosPorPessoa: ReadonlyMap<string, number>;
  custoHora: ReadonlyMap<string, number>;
}): ValorReal {
  if (p.deTerceiro) return { valor: p.custoRealTerceiro, parcial: false };
  let total = 0;
  let parcial = false;
  for (const [userId, minutos] of p.minutosPorPessoa) {
    if (!(minutos > 0)) continue;
    const taxa = p.custoHora.get(userId);
    if (taxa == null || !Number.isFinite(taxa)) {
      parcial = true;
      continue;
    }
    total += centesimos((minutos / 60) * taxa);
  }
  return { valor: total / 100, parcial };
}

/** Horas apontadas no ponto, com uma casa. Terceiro não aponta: não se mede. */
export function trabalhoRealDaFolha(p: { deTerceiro: boolean; minutos: number }): ValorReal {
  if (p.deTerceiro) return { valor: null, parcial: false };
  return { valor: Math.round(p.minutos / 6) / 10, parcial: false };
}

/**
 * Agrupamento = soma dos filhos que têm valor (`null` se nenhum tem), parcial se algum filho é.
 * Recursivo por `parentId`, com memória; um ciclo (dado corrompido) para em vez de estourar a pilha.
 */
export function somaNaArvore(
  linhas: readonly { id: string; parentId: string | null }[],
  folhas: ReadonlyMap<string, ValorReal>,
): Map<string, ValorReal> {
  const filhos = new Map<string, string[]>();
  for (const l of linhas) {
    if (l.parentId == null) continue;
    const lista = filhos.get(l.parentId) ?? [];
    lista.push(l.id);
    filhos.set(l.parentId, lista);
  }
  const memo = new Map<string, ValorReal>();
  const visitando = new Set<string>();
  const valor = (id: string): ValorReal => {
    const pronto = memo.get(id);
    if (pronto) return pronto;
    const meus = filhos.get(id) ?? [];
    if (meus.length === 0) {
      const v = folhas.get(id) ?? { valor: null, parcial: false };
      memo.set(id, v);
      return v;
    }
    if (visitando.has(id)) return { valor: null, parcial: false };
    visitando.add(id);
    let total = 0;
    let algum = false;
    let parcial = false;
    for (const f of meus) {
      const vf = valor(f);
      if (vf.parcial) parcial = true;
      if (vf.valor == null) continue;
      algum = true;
      total += centesimos(vf.valor);
    }
    visitando.delete(id);
    const v = { valor: algum ? total / 100 : null, parcial };
    memo.set(id, v);
    return v;
  };
  for (const l of linhas) valor(l.id);
  return memo;
}

/** Dias corridos de `base` até `atual` (positivo = depois da base); nulo se faltar um dos dois. */
export function diasDeVariacao(base: string | null, atual: string | null): number | null {
  if (!base || !atual) return null;
  return diasEntre(base, atual);
}
