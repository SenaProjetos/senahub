import { z } from "zod";

/** Tipos de referência técnica (client-safe — usado no form e como filtro). */
export const TIPOS_REFERENCIA = [
  { v: "artigo", l: "Artigo" },
  { v: "livro", l: "Livro" },
  { v: "nota_tecnica", l: "Nota técnica" },
  { v: "outro", l: "Outro" },
] as const;

export const TIPO_REFERENCIA_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS_REFERENCIA.map((t) => [t.v, t.l]),
);

/** Metadata devolvida pela rota de upload, persistida pela action. */
const metaArquivo = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mime: z.string().nullish(),
  tamanho: z.coerce.number().int().nonnegative(),
  hashSha256: z.string().nullish(),
});

const camposComuns = {
  titulo: z.string().trim().min(1, "Informe o título.").max(300),
  tipo: z.string().trim().min(1, "Informe o tipo."),
  autorObra: z.string().trim().max(200).optional(),
  ano: z.coerce.number().int().gte(1900, "Ano inválido.").lte(2100, "Ano inválido.").optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
  descricao: z.string().trim().max(2000).optional(),
  linkExterno: z.string().trim().url("Link inválido.").max(500).optional().or(z.literal("")),
  meta: metaArquivo.optional(),
};

/** Anexo OU link — ao menos um dos dois é exigido (não há constraint no banco). */
function exigeAnexoOuLink(data: { meta?: unknown; linkExterno?: string }, ctx: z.RefinementCtx) {
  if (!data.meta && !data.linkExterno) {
    ctx.addIssue({ code: "custom", message: "Informe um arquivo anexo ou um link externo.", path: ["linkExterno"] });
  }
}

export const criarReferenciaSchema = z.object(camposComuns).superRefine(exigeAnexoOuLink);
export type CriarReferenciaInput = z.infer<typeof criarReferenciaSchema>;

// Edição não repete a exigência de anexo/link aqui: a referência já pode ter um
// anexo salvo (meta ausente = "manter o atual"). A action confere o estado final.
export const editarReferenciaSchema = z.object({ id: z.string().min(1), ...camposComuns });
export type EditarReferenciaInput = z.infer<typeof editarReferenciaSchema>;

export const idSchema = z.object({ id: z.string().min(1) });
