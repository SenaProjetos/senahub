import { z } from "zod";

/** Tipos de padrão técnico (client-safe — usado no form e como validação leve). */
export const TIPOS_PADRAO = [
  { v: "prancha", l: "Prancha" },
  { v: "carimbo", l: "Carimbo" },
  { v: "detalhe", l: "Detalhe" },
  { v: "nota", l: "Nota / memorial" },
  { v: "outro", l: "Outro" },
] as const;

export const TIPO_PADRAO_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS_PADRAO.map((t) => [t.v, t.l]),
);

/** Metadata devolvida pela rota de upload, persistida pela action. */
const metaArquivo = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mime: z.string().nullish(),
  tamanho: z.coerce.number().int().nonnegative(),
  hashSha256: z.string().nullish(),
});

export const criarPadraoSchema = z.object({
  titulo: z.string().trim().min(1, "Informe o título.").max(200),
  descricao: z.string().trim().max(2000).optional(),
  tipo: z.string().trim().optional(),
  /** "" ou ausente = padrão geral (sem disciplina). */
  disciplinaId: z.string().optional(),
  meta: metaArquivo,
});
export type CriarPadraoInput = z.infer<typeof criarPadraoSchema>;

export const criarNormaSchema = z.object({
  numero: z.string().trim().min(1, "Informe o número.").max(120),
  titulo: z.string().trim().min(1, "Informe o título.").max(300),
  ano: z.coerce.number().int().gte(1900, "Ano inválido.").lte(2100, "Ano inválido."),
  meta: metaArquivo,
});
export type CriarNormaInput = z.infer<typeof criarNormaSchema>;

export const idSchema = z.object({ id: z.string().min(1) });
