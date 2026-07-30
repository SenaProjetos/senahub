import { z } from "zod";

const grandezaSchema = z.enum(["area", "volume", "comprimento", "contagem", "peso"]);
const origemSchema = z.enum(["manual", "ifc", "dwg", "pdf", "ia"]);

const camposComuns = {
  descricao: z.string().min(1, "Descrição é obrigatória."),
  grandeza: grandezaSchema,
  unidade: z.string().min(1, "Unidade é obrigatória."),
  quantidade: z.number().min(0, "Quantidade não pode ser negativa."),
  origem: origemSchema,
  confianca: z.number().min(0).max(1).nullable().optional(),
  uploadId: z.string().nullable().optional(),
  guids: z.array(z.string()).nullable().optional(),
  pagina: z.number().int().min(1).nullable().optional(),
  ancoraJson: z.unknown().optional(),
  memoria: z.string().nullable().optional(),
};

export const registrarQuantitativoSchema = z.object({
  orcamentoId: z.string().min(1),
  ...camposComuns,
});

export const recontarQuantitativoSchema = z.object({
  quantitativoAnteriorId: z.string().min(1),
  ...camposComuns,
});

export const aplicarQuantitativoSchema = z.object({
  quantitativoId: z.string().min(1),
  itemId: z.string().min(1),
});

export const idQuantitativoSchema = z.object({ id: z.string().min(1) });
export const idVinculoSchema = z.object({ id: z.string().min(1) });

export const listarQuantitativosSchema = z.object({
  orcamentoId: z.string().min(1),
  itemId: z.string().nullable().optional(),
});
