/**
 * Configuração do planejador de caixa (`ConfigSistema` chave `financeiro.liquidez`), spec §12.
 * Puro: o esquema e a normalização ficam aqui; leitura em `queries.ts`, gravação em `actions.ts`.
 */
import { z } from "zod";

export const CHAVE_CONFIG_LIQUIDEZ = "financeiro.liquidez";

export const HORIZONTES_DIAS = [30, 60, 90, 180] as const;
export type HorizontePadrao = (typeof HORIZONTES_DIAS)[number];

export type ConfigLiquidez = {
  /** Piso do saldo projetado, em centavos. 0 = sem alerta até alguém configurar. */
  reservaMinima: number;
  horizontePadraoDias: HorizontePadrao;
  /** Receita pendente vencida há mais que isto conta como incerta na projeção. */
  diasParaIncerta: number;
};

export const CONFIG_LIQUIDEZ_PADRAO: ConfigLiquidez = { reservaMinima: 0, horizontePadraoDias: 30, diasParaIncerta: 30 };

export const configLiquidezSchema = z.object({
  reservaMinima: z.number().int().min(0).max(100_000_000_000),
  horizontePadraoDias: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]),
  diasParaIncerta: z.number().int().min(1).max(365),
});

/** Lê o JSON guardado campo a campo; o que faltar ou vier inválido volta ao padrão. */
export function normalizarConfigLiquidez(valor: unknown): ConfigLiquidez {
  if (typeof valor !== "object" || valor === null) return { ...CONFIG_LIQUIDEZ_PADRAO };
  const v = valor as Record<string, unknown>;
  const campo = <K extends keyof ConfigLiquidez>(k: K): ConfigLiquidez[K] => {
    const r = configLiquidezSchema.shape[k].safeParse(v[k]);
    return (r.success ? r.data : CONFIG_LIQUIDEZ_PADRAO[k]) as ConfigLiquidez[K];
  };
  return {
    reservaMinima: campo("reservaMinima"),
    horizontePadraoDias: campo("horizontePadraoDias"),
    diasParaIncerta: campo("diasParaIncerta"),
  };
}
