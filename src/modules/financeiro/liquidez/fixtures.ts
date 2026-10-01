/**
 * Apoio dos testes do motor de liquidez (puro). Datas sempre relativas a `HOJE` via `dia(n)`.
 * Não é importado por código de produção.
 */
import { EIXOS_PADRAO } from "@/modules/financeiro/liquidez/cenario";
import { somarDias } from "@/modules/financeiro/liquidez/datas";
import type { EntradaMotor } from "@/modules/financeiro/liquidez/motor";
import type { Centavos, DataIso, EventoCaixa } from "@/modules/financeiro/liquidez/tipos";

export const HOJE: DataIso = "2026-10-01";

/** D+n relativo a HOJE (n negativo = passado). */
export const dia = (n: number): DataIso => somarDias(HOJE, n);

/** Reais → centavos, para os testes lerem como a spec. */
export const reais = (v: number): Centavos => Math.round(v * 100);

type Obrigatorio = Pick<EventoCaixa, "id" | "tipo" | "valor" | "data">;

export function evento(p: Obrigatorio & Partial<EventoCaixa>): EventoCaixa {
  return {
    origem: "lancamento",
    natureza: "resultado",
    vencido: p.data < HOJE,
    descricao: p.id,
    favorecido: null,
    projeto: null,
    categoriaNome: null,
    status: "previsto",
    prioridade: p.tipo === "despesa" ? "p3" : null,
    confianca: p.tipo === "receita" ? "provavel" : null,
    caixinhaId: null,
    naoProgramavel: null,
    transferencia: null,
    ...p,
  };
}

export function entradaMotor(sobre: Partial<EntradaMotor> = {}): EntradaMotor {
  return {
    hoje: HOJE,
    horizonteDias: 30,
    caixaAtual: reais(100),
    reservaMinima: reais(30),
    eventos: [],
    caixinhas: [],
    eixos: EIXOS_PADRAO,
    ...sobre,
  };
}

/** Congela a estrutura inteira: se o motor tentar mutar a entrada, o teste quebra. */
export function congelar<T>(x: T): T {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as Record<string, unknown>)) congelar(v);
  }
  return x;
}

/** Saldo de fechamento de D+n na série. */
export function saldoEm(serie: readonly { dia: DataIso; saldo: Centavos }[], n: number): Centavos {
  const d = serie.find((s) => s.dia === dia(n));
  if (!d) throw new Error(`Dia fora da série: D+${n}`);
  return d.saldo;
}
