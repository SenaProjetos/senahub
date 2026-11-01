import { z } from "zod";

export const adicionarInputSchema = z.object({
  projetoId: z.string().min(1),
  disciplina: z.string().optional(),
  pergunta: z.string().trim().min(1, "Informe a pergunta."),
});

/** Remover e restaurar: a pergunta é sempre deste projeto (o servidor confere). */
export const removerInputSchema = z.object({ projetoId: z.string().min(1), id: z.string().min(1) });

export const editarInputSchema = z.object({
  projetoId: z.string().min(1),
  id: z.string().min(1),
  disciplina: z.string().optional(),
  pergunta: z.string().trim().min(1, "Informe a pergunta."),
});

/** Ocultar/mostrar uma seção (`id`) ou um campo (`chave`) do briefing NESTE projeto. */
export const visibilidadeBriefingSchema = z.object({
  projetoId: z.string().min(1),
  alvo: z.enum(["secao", "campo"]),
  chave: z.string().min(1),
  oculto: z.boolean(),
});

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
