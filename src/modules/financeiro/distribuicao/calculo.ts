/**
 * Distribuição de recebimentos entre caixinhas (plano F5, I9). Puro: sem banco e sem Next — roda no
 * navegador (prévia ao digitar) e no servidor (a mesma conta na hora de gravar). Dinheiro em centavos
 * inteiros e percentual em basis points (10000 = 100%), então 100% fecha exato, sem float.
 *
 * Uma regra SUGERE; nada é separado antes de a pessoa confirmar.
 */
import type { Centavos, DataIso } from "@/modules/financeiro/liquidez/tipos";

export const BP_TOTAL = 10_000;

/** `caixinhaId: null` = "Operacional (livre)": a parte fica no caixa, sem caixinha. */
export type ItemDeRegra = { caixinhaId: string | null; bp: number };
export type ParteRateada = { caixinhaId: string | null; valor: Centavos; bp: number };

export function somaBp(itens: readonly Pick<ItemDeRegra, "bp">[]): number {
  return itens.reduce((s, i) => s + i.bp, 0);
}

/** "35" ou "12,5" → basis points; `null` se não for número entre 0 e 100 (com até 2 casas). */
export function bpDoTexto(texto: string): number | null {
  const t = texto.trim().replace("%", "").replace(/\s/g, "").replace(",", ".");
  if (t === "" || !/^\d+(\.\d{0,2})?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100);
  return n >= 0 && n <= BP_TOTAL ? n : null;
}

/** 3500 → "35%"; 1250 → "12,5%". */
export function bpParaTexto(bp: number): string {
  const p = bp / 100;
  return `${Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0$/, "").replace(".", ",")}%`;
}

/**
 * Motivo de a divisão não poder ser salva/confirmada (`null` = pode). Os itens precisam fechar
 * exatamente 100%, sem caixinha repetida e sem parte zerada (uma parte zerada é só ruído).
 */
export function motivoDaDivisao(itens: readonly ItemDeRegra[]): string | null {
  if (itens.length === 0) return "Adicione ao menos um destino.";
  if (itens.some((i) => !Number.isInteger(i.bp) || i.bp <= 0)) return "Cada destino precisa de um percentual maior que zero.";
  const vistos = new Set<string | null>();
  for (const i of itens) {
    if (vistos.has(i.caixinhaId)) return i.caixinhaId === null ? "“Operacional (livre)” aparece mais de uma vez." : "Uma caixinha aparece mais de uma vez.";
    vistos.add(i.caixinhaId);
  }
  const soma = somaBp(itens);
  if (soma < BP_TOTAL) return `Faltam ${bpParaTexto(BP_TOTAL - soma)} para fechar 100%.`;
  if (soma > BP_TOTAL) return `Passou ${bpParaTexto(soma - BP_TOTAL)} de 100%.`;
  return null;
}

/**
 * Parte de cada destino em centavos: cada uma é o piso de `valor × bp / 10000`, e a última leva o
 * resto (a soma fecha o valor exato). Itens inválidos (soma ≠ 100%) devolvem lista vazia: quem chama
 * confere `motivoDaDivisao` antes.
 */
export function ratear(valor: Centavos, itens: readonly ItemDeRegra[]): ParteRateada[] {
  if (motivoDaDivisao(itens) !== null || !Number.isInteger(valor) || valor < 0) return [];
  let usado = 0;
  return itens.map((i, k) => {
    const v = k === itens.length - 1 ? valor - usado : Math.floor((valor * i.bp) / BP_TOTAL);
    usado += v;
    return { caixinhaId: i.caixinhaId, valor: v, bp: i.bp };
  });
}

/** Só o que vira reservado: as partes de caixinha (a livre não move nada). */
export function partesDeCaixinha(partes: readonly ParteRateada[]): { caixinhaId: string; valor: Centavos }[] {
  return partes.flatMap((p) => (p.caixinhaId !== null && p.valor > 0 ? [{ caixinhaId: p.caixinhaId, valor: p.valor }] : []));
}

export type RegraParaSugerir = { id: string; ativa: boolean; padrao: boolean; categoriasIds: readonly string[] };

/**
 * Regra sugerida para um recebimento: a ativa que cita a categoria da receita; senão a padrão ativa;
 * senão nenhuma (a pessoa escolhe). Mais de uma citando a categoria: a mais antiga na lista vence —
 * quem chama passa as regras na ordem de criação.
 */
export function regraSugerida<T extends RegraParaSugerir>(regras: readonly T[], categoriaId: string | null): T | null {
  const ativas = regras.filter((r) => r.ativa);
  return (categoriaId ? ativas.find((r) => r.categoriasIds.includes(categoriaId)) : undefined) ?? ativas.find((r) => r.padrao) ?? null;
}

// ── O que entra em "Recebimentos a distribuir" ───────────────────────────────

export type RecebimentoParaDistribuir = {
  tipo: "receita" | "despesa";
  status: string;
  natureza: "resultado" | "fora_do_resultado" | "transferencia";
  dataConfirmacao: DataIso | null;
  tags: readonly string[];
  /** Já tem linha em `DistribuicaoRecebimento` (distribuído ou pulado). */
  tratado: boolean;
};

export const TAG_REEMBOLSO = "reembolso-art";

/**
 * Receita REALIZADA, do resultado (transferência não é receita; reembolso de ART é devolução, não
 * dinheiro da empresa), recebida a partir de `distribuirDesde` e ainda não tratada. Sem
 * `distribuirDesde` nada é oferecido: uma data inicial evita abrir a fila com todo o histórico.
 */
export function elegivelParaDistribuir(r: RecebimentoParaDistribuir, distribuirDesde: DataIso | null): boolean {
  if (!distribuirDesde || r.tratado) return false;
  if (r.tipo !== "receita" || r.status !== "confirmado" || r.natureza !== "resultado") return false;
  if (r.tags.includes(TAG_REEMBOLSO)) return false;
  return r.dataConfirmacao != null && r.dataConfirmacao >= distribuirDesde;
}
