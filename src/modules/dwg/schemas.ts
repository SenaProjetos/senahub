import { z } from "zod";

export const converterDwgSchema = z.object({
  // desenhoId: uploadId cru (disciplina) ou `d:<documentoVersaoId>` (recebido do cliente).
  desenhoId: z.string().min(1),
});
