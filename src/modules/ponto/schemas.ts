import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (HH:MM).");
const diaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const itemEdicaoBatidaSchema = z.object({
  tipo: z.enum(["entrada", "inicio_descanso", "fim_descanso", "saida"]),
  hora: hhmm,
  projetoId: z.string().nullable().optional(),
});

export const ajustePontoProprioSchema = z.object({
  dia: diaISO,
  itens: z.array(itemEdicaoBatidaSchema).max(20),
  justificativa: z.string().min(5, "Descreva o motivo (mín. 5 caracteres)."),
});

export const ajustePontoEquipeSchema = ajustePontoProprioSchema.extend({
  userId: z.string().min(1),
});

export const cienciaAjusteSchema = z.object({ ajusteId: z.string().min(1) });

export const contestarAjusteSchema = z.object({
  ajusteId: z.string().min(1),
  motivo: z.string().min(5, "Descreva o motivo da contestação (mín. 5 caracteres)."),
});
