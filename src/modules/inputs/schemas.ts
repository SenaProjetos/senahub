import { z } from "zod";

export const adicionarInputSchema = z.object({
  projetoId: z.string().min(1),
  disciplina: z.string().optional(),
  pergunta: z.string().min(1, "Informe a pergunta."),
});

export const removerInputSchema = z.object({ id: z.string().min(1) });

export const responderInputsSchema = z.object({
  projetoId: z.string().min(1),
  respostas: z.array(z.object({ id: z.string().min(1), resposta: z.string() })),
});

export const gerarLinkSchema = z.object({ projetoId: z.string().min(1) });

export type AdicionarInputInput = z.infer<typeof adicionarInputSchema>;
