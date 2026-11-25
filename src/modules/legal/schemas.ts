import { z } from "zod";

export const aceitarTermoSchema = z.object({
  tipo: z.enum(["colaborador", "cliente", "obra"]),
  versao: z.string().min(1),
});

export type AceitarTermoInput = z.infer<typeof aceitarTermoSchema>;
