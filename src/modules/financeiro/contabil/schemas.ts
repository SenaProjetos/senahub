import { z } from "zod";
import { FORMATOS_CONTABIL } from "@/modules/financeiro/contabil/arquivo";
import { IMPOSTOS_RETIDOS } from "@/modules/financeiro/lancamentos/retencoes";

const id = z.string().min(1);
export const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido.");

export const alvoEditavelSchema = z.enum(["categoria", "conta_bancaria", "imposto_recolher", "imposto_compensar"]);

/** C4: nos impostos retidos o alvo é o próprio imposto (`iss`, `irrf`…), não um id. */
const impostoValido = (i: { alvo: string; alvoId: string }) =>
  !i.alvo.startsWith("imposto_") || (IMPOSTOS_RETIDOS as readonly string[]).includes(i.alvoId);
const MOTIVO_IMPOSTO = { message: "Imposto desconhecido.", path: ["alvoId"] };

export const definirContaSchema = z
  .object({ alvo: alvoEditavelSchema, alvoId: id, reduzido: z.number().int().positive() })
  .refine(impostoValido, MOTIVO_IMPOSTO);

export const limparContaSchema = z.object({ alvo: alvoEditavelSchema, alvoId: id }).refine(impostoValido, MOTIVO_IMPOSTO);

export const copiarContaSchema = z.object({ deCategoriaId: id, paraCategoriaId: id });

export const lancamentosDaCategoriaSchema = z.object({ categoriaId: id, mes: mesSchema });

export const exportarMesSchema = z.object({ mes: mesSchema, formato: z.enum(FORMATOS_CONTABIL) });
