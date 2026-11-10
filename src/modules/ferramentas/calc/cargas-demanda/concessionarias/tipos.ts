/**
 * Contrato comum dos métodos de demanda por área útil — **puro**. Cada concessionária usa só o seu método e os seus
 * valores (spec §2); o conjunto de informações é o mesmo (spec §3.1), os campos do método mudam (spec §3.4).
 */

import { MSG, type Mensagem } from "../mensagens";

/** Um tipo de apartamento do nível (CMD ou CPG): quantidade NESSE nível. */
export type TipoApartamento = { nome: string; quantidade: number; areaUtilM2: number };

/**
 * Fator do método: o valor sugerido pela norma (azul na tela) e o adotado (digitado ou igual ao sugerido).
 * `sugerido = null` = a norma não traz (campo âmbar, "digite").
 */
export type FatorDoMetodo = {
  chave: string;
  rotulo: string;
  simbolo?: string;
  unidade?: string;
  sugerido: number | null;
  adotado: number | null;
  /** Origem do sugerido, só no relatório (ex.: "DIS-NOR-053 Rev. 06, Quadro 36"). */
  referencia: string;
  /** Fator digitado diferente do sugerido. */
  digitado: boolean;
};

/** Um passo da conta, na ordem em que a norma o faz (tela: resumo; relatório: memória). */
export type PassoDoMetodo = {
  chave: string;
  rotulo: string;
  simbolo?: string;
  valor: number | null;
  unidade: string;
  formula?: string;
};

export type ResultadoAreaUtil = {
  fatores: FatorDoMetodo[];
  passos: PassoDoMetodo[];
  /**
   * Demanda dos apartamentos no nível, em kVA, com os fatores ADOTADOS (digitados ou sugeridos) que a norma aplica a
   * eles — inclusive o fator do conjunto, quando há. `null` = falta valor.
   */
  demandaKVA: number | null;
  /** A mesma conta só com os valores SUGERIDOS pela norma (o "critério"; pergunta 1 do plano). `null` = falta valor. */
  demandaCriterioKVA: number | null;
  /**
   * Fator que a norma aplica aos apartamentos E ao condomínio juntos (Celesc k, Energisa 1,3, Copel fator multiplicador).
   * Já está em `demandaKVA`; a composição do nível (passo 5) o aplica também ao condomínio. Ausente = não há.
   */
  fatorDoConjunto?: FatorDoMetodo;
  avisos: Mensagem[];
};

/** Ajustes do projetista: chave do fator → valor digitado. */
export type Ajustes = Readonly<Record<string, number | undefined>>;

/** Sugerido × digitado (spec §3.1 regra 5 e §6 "valor digitado abaixo do valor da norma"). */
export function fator(
  chave: string,
  rotulo: string,
  sugerido: number | null,
  referencia: string,
  ajustes: Ajustes | undefined,
  extra?: { simbolo?: string; unidade?: string },
): FatorDoMetodo {
  const digitadoValor = ajustes?.[chave];
  const digitado = digitadoValor != null && Number.isFinite(digitadoValor) && digitadoValor !== sugerido;
  return {
    chave,
    rotulo,
    ...extra,
    sugerido,
    adotado: digitadoValor != null && Number.isFinite(digitadoValor) ? digitadoValor : sugerido,
    referencia,
    digitado,
  };
}

/** Média ponderada das áreas: Σ(n·A) ÷ Σn. */
export function areaMediaPonderada(tipos: readonly TipoApartamento[]): number {
  const n = tipos.reduce((s, t) => s + t.quantidade, 0);
  return n > 0 ? tipos.reduce((s, t) => s + t.quantidade * t.areaUtilM2, 0) / n : 0;
}

export function totalDeApartamentos(tipos: readonly TipoApartamento[]): number {
  return tipos.reduce((s, t) => s + t.quantidade, 0);
}

/** Spec §6 "valor digitado abaixo do valor da norma": um alerta por fator digitado menor que o sugerido. */
export function avisosAbaixoDaNorma(fatores: readonly FatorDoMetodo[], concessionaria: string): Mensagem[] {
  return fatores
    .filter((f) => f.digitado && f.sugerido != null && f.adotado != null && f.adotado < f.sugerido - 1e-9)
    .map((f) => MSG.valorAbaixoNorma(f.adotado!, concessionaria, f.sugerido!, f.referencia));
}

/** Produto dos valores (adotados ou sugeridos); `null` se algum faltar. */
export function produto(valores: readonly (number | null)[]): number | null {
  return valores.some((v) => v == null) ? null : valores.reduce<number>((a, v) => a * (v as number), 1);
}
