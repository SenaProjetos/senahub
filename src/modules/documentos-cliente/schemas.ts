import { z } from "zod";

/** Metadados do arquivo já gravado em disco (retorno de `POST /api/documentos`). */
export const metaDocumento = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mime: z.string().min(1),
  tamanho: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
});
export type MetaDocumento = z.infer<typeof metaDocumento>;

export const ORIGENS_DOCUMENTO = ["recebido_cliente", "interno", "contrato", "comercial"] as const;
