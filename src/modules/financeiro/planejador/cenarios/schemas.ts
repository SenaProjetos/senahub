import { z } from "zod";
import { ajusteSchema, premissasSchema } from "@/modules/financeiro/liquidez/ajustes";

const nome = z.string().trim().min(1, "Dê um nome ao cenário.").max(120, "Nome muito longo (até 120 caracteres).");
const descricao = z.string().trim().max(500, "Descrição muito longa (até 500 caracteres).").optional();

export const salvarCenarioSchema = z.object({
  /** Ausente = cenário novo. */
  id: z.string().min(1).optional(),
  nome,
  descricao,
  premissas: premissasSchema,
  /** Só os ajustes ainda não aplicados: os aplicados ficam no cenário como histórico. */
  ajustes: z.array(ajusteSchema).max(500),
});

export const idCenarioSchema = z.object({ id: z.string().min(1) });
export const renomearCenarioSchema = z.object({ id: z.string().min(1), nome, descricao });

export const previaAplicacaoSchema = z.object({ ajustes: z.array(ajusteSchema).max(500) });
export const aplicarCenarioSchema = z.object({
  cenarioId: z.string().min(1).nullable().optional(),
  ajustes: z.array(ajusteSchema).min(1, "Nenhum ajuste para aplicar.").max(500),
});
