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

/** Revoga (`ativo=false`) e/ou define a validade do link público de inputs. */
export const atualizarLinkSchema = z.object({
  projetoId: z.string().min(1),
  ativo: z.boolean(),
  expiraEm: z.string().datetime().nullable().optional(),
});

export type AdicionarInputInput = z.infer<typeof adicionarInputSchema>;
