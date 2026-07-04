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
  tipo: z.enum(["particular", "licitacao", "aprovacao"]),
  nome: z.string().min(2, "Informe o nome do projeto."),
  clienteId: z.string().min(1, "Selecione o cliente."),
  descricao: z.string().optional(),
  areaM2: z.number().nonnegative().optional(),
  endereco: z.string().optional(),
  prazoFinal: z.string().optional(),
  valorContrato: z.number().nonnegative().optional(),
  disciplinas: z.array(disciplinaInputSchema).min(1, "Adicione ao menos uma disciplina."),
  membrosIds: z.array(z.string()).default([]),
});

export const editarProjetoSchema = z.object({
  id: z.string().min(1),
  /** P-03: permite trocar o cliente. */
  clienteId: z.string().min(1).optional(),
  nome: z.string().min(2),
  tipo: z.enum(["particular", "licitacao", "aprovacao"]),
  situacao: z.enum(["em_andamento", "concluido", "arquivado", "cancelado"]),
  descricao: z.string().optional(),
  areaM2: z.number().nonnegative().optional(),
  endereco: z.string().optional(),
  prazoFinal: z.string().optional(),
  valorContrato: z.number().nonnegative().optional(),
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
  membros: z.array(z.object({ userId: z.string().min(1), papel: z.string().optional().nullable() })),
});

export const duplicarProjetoSchema = z.object({
  id: z.string().min(1),
  copiarResponsaveis: z.boolean().default(true),
  copiarMembros: z.boolean().default(true),
  copiarEap: z.boolean().default(false),
  copiarComposicao: z.boolean().default(false),
});

/** P-48: edição em massa de disciplinas (status, prazo, responsável único). */
export const editarDisciplinasEmMassaSchema = z.object({
  projetoId: z.string().min(1),
  disciplinaIds: z.array(z.string().min(1)).min(1),
  status: z.enum(STATUS_DISCIPLINA).optional(),
  prazo: z.string().date().nullable().optional(),
  responsavelId: z.string().nullable().optional(),
});

/** P-02: adicionar disciplina a um projeto existente. */
export const criarDisciplinaSchema = z.object({
  projetoId: z.string().min(1),
  nome: z.string().min(1, "Informe o nome da disciplina."),
  prazo: z.string().date().optional(),
  valor: z.number().nonnegative().optional(),
  responsaveisIds: z.array(z.string()).default([]),
});

/** P-02/P-13: editar disciplina existente. */
export const editarDisciplinaSchema = z.object({
  disciplinaId: z.string().min(1),
  nome: z.string().min(1, "Informe o nome da disciplina."),
  prazo: z.string().date().nullable().optional(),
  valor: z.number().nonnegative().nullable().optional(),
  responsaveisIds: z.array(z.string()).default([]),
  exigePacoteA: z.boolean().optional(),
  exigePacoteB: z.boolean().optional(),
});

/** P-02: excluir disciplina (bloqueado se houver uploads ou pagamentos). */
export const excluirDisciplinaSchema = z.object({
  disciplinaId: z.string().min(1),
});

/** P-05: cancelar/arquivar/reativar projeto. */
export const cancelarProjetoSchema = z.object({
  projetoId: z.string().min(1),
  situacao: z.enum(["em_andamento", "cancelado", "arquivado"]),
  motivo: z.string().optional(),
});

/** P-09: adicionar disciplinas do catálogo a um projeto existente. */
export const adicionarDoCatalogoSchema = z.object({
  projetoId: z.string().min(1),
  nomes: z.array(z.string().min(1)).min(1),
});

/** Item 15: CRUD do catálogo de disciplinas (Configurações → Disciplinas). */
export const criarDisciplinaCatalogoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da disciplina."),
  /** Sigla p/ nomenclatura; normalizada (uppercase, só A-Z0-9) na action. */
  codigo: z.string().trim().max(6, "Código de até 6 caracteres.").optional(),
  categoria: z.string().trim().max(40).optional(),
  /** Chave da galeria lucide. */
  icone: z.string().trim().max(60).optional(),
  /** SVG bruto do upload; sanitizado na action. */
  iconeSvg: z.string().max(40000, "SVG muito grande.").optional(),
});

export const editarDisciplinaCatalogoSchema = criarDisciplinaCatalogoSchema.extend({
  id: z.string().min(1),
});

export const idDisciplinaCatalogoSchema = z.object({ id: z.string().min(1) });

export type CriarProjetoInput = z.infer<typeof criarProjetoSchema>;
export type DisciplinaInput = z.infer<typeof disciplinaInputSchema>;
