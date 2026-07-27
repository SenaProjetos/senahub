import { z } from "zod";

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const tipoArt = z.enum(["ART", "RRT", "TRT"]);
/** `substituida` não entra: é atribuída pelo sistema à versão anterior ao criar uma nova. */
const situacaoArt = z.enum(["rascunho", "registrada", "baixada", "cancelada"]);

export const salvarArtSchema = z.object({
  id: z.string().optional(),
  projetoId: z.string().min(1),
  disciplinaId: opt(z.string()),
  tipo: tipoArt.default("ART"),
  numero: z.string().min(1, "Informe o número da ART."),
  descricao: opt(z.string().max(300)),
  situacao: situacaoArt.default("registrada"),
  emitidaEm: opt(z.string()),
  valor: z.number().min(0).optional().nullable(),
  /** Usuário responsável; vazio = usar os campos avulsos abaixo. */
  responsavelUserId: opt(z.string()),
  responsavelNome: opt(z.string().max(120)),
  responsavelRegistro: opt(z.string().max(60)),
});

export const novaVersaoArtSchema = z.object({
  id: z.string().min(1),
  numero: z.string().min(1, "Informe o número da ART."),
  situacao: situacaoArt.default("registrada"),
  emitidaEm: opt(z.string()),
  /** Por que a versão nova existe — obrigatório: é o que dá sentido ao histórico. */
  observacao: z.string().min(3, "Descreva o motivo da nova versão."),
});

export const artIdSchema = z.object({ id: z.string().min(1) });

/** Metadados devolvidos por `POST /api/projetos/art` depois de gravar o PDF no disco. */
export const anexarArquivoArtSchema = z.object({
  id: z.string().min(1),
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
});

export type SalvarArtInput = z.infer<typeof salvarArtSchema>;
export type NovaVersaoArtInput = z.infer<typeof novaVersaoArtSchema>;
