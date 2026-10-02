import { z } from "zod";

const id = z.string().min(1);
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const novaTransferenciaSchema = z.object({
  origemId: id,
  destinoId: id,
  valor: z.number().positive("O valor da transferência tem que ser maior que zero."),
  data: dia,
  descricao: z.string().trim().max(120).optional().or(z.literal("")),
  observacao: z.string().trim().max(500).optional().or(z.literal("")),
  realizada: z.boolean().default(true),
});

export const editarTransferenciaSchema = novaTransferenciaSchema.omit({ realizada: true }).extend({ transferenciaId: id });
export const idTransferenciaSchema = z.object({ transferenciaId: id });
export const baixarTransferenciaSchema = z.object({ transferenciaId: id, data: dia });

export const corrigirPagamentoSchema = z.object({
  id,
  contaId: id,
  formaId: id.nullable().optional().or(z.literal("")),
  dataConfirmacao: dia,
});
