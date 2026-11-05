// Schemas das ações da sobreposição 2D. Ficam fora do arquivo "use server" (que só pode exportar funções async).
import { z } from "zod";

const id = z.string().min(1);
const nome = z
  .string()
  .trim()
  .min(1, "Dê um nome à sobreposição.")
  .max(60, "Use até 60 caracteres no nome.");
export const formatoSchema = z.enum(["pdf", "dwg"]);
const numero = z.number().finite();

export const alinhamentoSchema = z.object({
  tx: numero,
  ty: numero,
  giro: numero,
  escala: numero.positive("A escala precisa ser maior que zero."),
});

export const criarSobreposicaoSchema = z.object({ projetoId: id, nome });
export const renomearSobreposicaoSchema = z.object({ id, nome });
export const idSobreposicaoSchema = z.object({ id });

export const adicionarCamadaSchema = z.object({ sobreposicaoId: id, documentoId: id, formato: formatoSchema });

export const atualizarCamadaSchema = z.object({
  camadaId: id,
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.").optional(),
  opacidade: z.number().int().min(0).max(100).optional(),
  visivel: z.boolean().optional(),
  ordem: z.number().int().optional(),
  formato: formatoSchema.optional(),
  pagina: z.number().int().min(1).optional(),
});

export const idCamadaSchema = z.object({ camadaId: id });

export const salvarAlinhamentoSchema = z.object({
  camadaId: id,
  formato: formatoSchema,
  alinhamento: alinhamentoSchema,
  versaoLida: z.number().int().min(1).nullable(),
});

export const confirmarAlinhamentoSchema = z.object({
  camadaId: id,
  formato: formatoSchema,
  versaoLida: z.number().int().min(1),
});

export type CriarSobreposicaoInput = z.infer<typeof criarSobreposicaoSchema>;
export type RenomearSobreposicaoInput = z.infer<typeof renomearSobreposicaoSchema>;
export type AdicionarCamadaInput = z.infer<typeof adicionarCamadaSchema>;
export type AtualizarCamadaInput = z.infer<typeof atualizarCamadaSchema>;
export type SalvarAlinhamentoInput = z.infer<typeof salvarAlinhamentoSchema>;
export type ConfirmarAlinhamentoInput = z.infer<typeof confirmarAlinhamentoSchema>;
