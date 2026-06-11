import { z } from "zod";

export const STATUS_DISCIPLINA = [
  "aguardando",
  "em_andamento",
  "em_revisao",
  "entregue",
  "aprovado",
] as const;

export const disciplinaInputSchema = z.object({
  nome: z.string().min(1, "Informe a disciplina."),
  prazo: z.string().optional(), // ISO date
  valor: z.number().nonnegative().optional(),
  responsaveisIds: z.array(z.string()).default([]),
});

export const criarProjetoSchema = z.object({
  tipo: z.enum(["particular", "licitacao"]),
  nome: z.string().min(2, "Informe o nome do projeto."),
  clienteId: z.string().min(1, "Selecione o cliente."),
  descricao: z.string().optional(),
  areaM2: z.number().nonnegative().optional(),
  endereco: z.string().optional(),
  prazoFinal: z.string().optional(),
  disciplinas: z.array(disciplinaInputSchema).min(1, "Adicione ao menos uma disciplina."),
  membrosIds: z.array(z.string()).default([]),
});

export const editarProjetoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(2),
  tipo: z.enum(["particular", "licitacao"]),
  situacao: z.enum(["em_andamento", "concluido", "arquivado", "cancelado"]),
  descricao: z.string().optional(),
  areaM2: z.number().nonnegative().optional(),
  endereco: z.string().optional(),
  prazoFinal: z.string().optional(),
});

export const atualizarStatusDisciplinaSchema = z.object({
  disciplinaId: z.string().min(1),
  status: z.enum(STATUS_DISCIPLINA),
});

export const responsaveisDisciplinaSchema = z.object({
  disciplinaId: z.string().min(1),
  responsaveisIds: z.array(z.string()),
});

export const registrarRevisaoSchema = z.object({
  disciplinaId: z.string().min(1),
  motivo: z.string().optional(),
});

export const membrosProjetoSchema = z.object({
  projetoId: z.string().min(1),
  membrosIds: z.array(z.string()),
});

export type CriarProjetoInput = z.infer<typeof criarProjetoSchema>;
export type DisciplinaInput = z.infer<typeof disciplinaInputSchema>;
