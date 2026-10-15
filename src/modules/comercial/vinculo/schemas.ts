import { z } from "zod";

const id = z.string().min(1);

export const candidatosSchema = z.object({ modo: z.enum(["ficha", "projeto"]), id });

export const previaSchema = z.object({ projetoId: id, negociacaoId: id });

export const linkarSchema = z.object({
  projetoId: id,
  negociacaoId: id,
  arquivos: z.array(z.object({ chave: id, exibirEmRecebidos: z.boolean() })).max(100),
  incluirResumo: z.boolean(),
});

export const desfazerSchema = z.object({ projetoId: id });
