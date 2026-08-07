import { z } from "zod";

/** Espelha o enum Prisma `Setor` (mesma lista usada em `rh/funcionarios/actions.ts`). */
export const SETOR_VALUES = ["diretoria", "administrativo", "juridico", "engenharia", "ti"] as const;

const nome = z
  .string()
  .trim()
  .min(2, "Informe um nome com pelo menos 2 caracteres.")
  .max(80, "Nome muito longo (máx. 80 caracteres).");

export const criarCargoSchema = z.object({ nome });
export const editarCargoSchema = z.object({ id: z.string().min(1), nome });

export const criarDepartamentoSchema = z.object({
  nome,
  /** Setor-pai. Ausente/nulo = departamento ainda não vinculado a um setor. */
  setor: z.enum(SETOR_VALUES).nullable().optional(),
});
export const editarDepartamentoSchema = criarDepartamentoSchema.extend({ id: z.string().min(1) });

export const idSchema = z.object({ id: z.string().min(1) });

/** Reordenação: a tela manda a lista inteira na ordem final. */
export const reordenarSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });
