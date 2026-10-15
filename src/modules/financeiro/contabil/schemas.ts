import { z } from "zod";
import { FORMATOS_CONTABIL } from "@/modules/financeiro/contabil/arquivo";

const id = z.string().min(1);
export const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido.");

export const alvoEditavelSchema = z.enum(["categoria", "conta_bancaria"]);

export const definirContaSchema = z.object({
  alvo: alvoEditavelSchema,
  alvoId: id,
  reduzido: z.number().int().positive(),
});

export const limparContaSchema = z.object({ alvo: alvoEditavelSchema, alvoId: id });

export const copiarContaSchema = z.object({ deCategoriaId: id, paraCategoriaId: id });

export const lancamentosDaCategoriaSchema = z.object({ categoriaId: id, mes: mesSchema });

export const exportarMesSchema = z.object({ mes: mesSchema, formato: z.enum(FORMATOS_CONTABIL) });
