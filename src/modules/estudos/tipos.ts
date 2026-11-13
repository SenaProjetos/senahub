import { conteudoSchema as conteudoCargasDemandaSchema, conteudoVazio as conteudoVazioCargasDemanda } from "./cargas-demanda/conteudo";
import { conteudoSchema as conteudoCargasSchema, conteudoVazio as conteudoVazioCargas } from "./conteudo";
import { TIPO_ESTUDO_CARGAS, TIPO_ESTUDO_CARGAS_DEMANDA, tipoDeEstudoValido, type TipoDeEstudo } from "./acesso";

/**
 * Despacho do Estudos por `EstudoProjeto.tipo` — PURO. Cada tipo tem o seu documento (esquema Zod) e o seu estado
 * inicial. Linha sem tipo reconhecível é tratada como o legado (cargas por ambiente), que é o `@default` da coluna.
 */

export const TIPO_ESTUDO_ROTULO: Record<TipoDeEstudo, string> = {
  [TIPO_ESTUDO_CARGAS]: "Cargas por ambiente",
  [TIPO_ESTUDO_CARGAS_DEMANDA]: "Cargas e demanda por concessionária",
};

export const TIPO_ESTUDO_DESCRICAO: Record<TipoDeEstudo, string> = {
  [TIPO_ESTUDO_CARGAS]: "Lança os ambientes e as cargas e calcula a demanda total, como a calculadora Corrente e demanda.",
  [TIPO_ESTUDO_CARGAS_DEMANDA]:
    "Levantamento, demanda pelo método da concessionária e entrada por CMD e CPG, para edificações de múltiplas unidades.",
};

/** Tipo gravado → tipo conhecido. Qualquer outra coisa (linha antiga, nula) cai no legado. */
export function tipoDaLinha(tipo: unknown): TipoDeEstudo {
  return tipoDeEstudoValido(tipo) ? tipo : TIPO_ESTUDO_CARGAS;
}

/** Documento de um estudo recém-criado do tipo. */
export function conteudoVazioDoTipo(tipo: TipoDeEstudo): unknown {
  return tipo === TIPO_ESTUDO_CARGAS_DEMANDA ? conteudoVazioCargasDemanda() : conteudoVazioCargas();
}

export type ConteudoValidado = { ok: true; conteudo: unknown } | { ok: false; mensagem: string };

/**
 * Confere o documento que a tela mandou contra o esquema do tipo do estudo. A mensagem é a do primeiro problema
 * (a mesma que o esquema usa para a tela), pronta para virar `ActionError`.
 */
export function validarConteudoDoTipo(tipo: TipoDeEstudo, json: unknown): ConteudoValidado {
  const r = (tipo === TIPO_ESTUDO_CARGAS_DEMANDA ? conteudoCargasDemandaSchema : conteudoCargasSchema).safeParse(json);
  if (r.success) return { ok: true, conteudo: r.data };
  return { ok: false, mensagem: r.error.issues[0]?.message ?? "O conteúdo do estudo é inválido." };
}
