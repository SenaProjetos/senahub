"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const plan = { modulo: "planejamento", recurso: "planejamento", permissao: "gerir" } as const;
const rec = { modulo: "recursos", recurso: "recursos", permissao: "gerir" } as const;

const revProjeto = (projetoId: string) => {
  revalidatePath(`/planejamento/${projetoId}`);
  revalidatePath("/planejamento");
};
const revRecursos = () => revalidatePath("/recursos");

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));
const dia = z.string().min(1, "Informe a data.");

// ── EAP ──────────────────────────────────────────────────────

const tarefaSchema = z
  .object({
    projetoId: z.string().min(1),
    parentId: opt(z.string()),
    disciplinaId: opt(z.string()),
    nome: z.string().min(1, "Informe o nome."),
    inicioPrevisto: dia,
    fimPrevisto: dia,
    progresso: z.number().int().min(0).max(100).default(0),
  })
  .refine((v) => new Date(v.fimPrevisto) >= new Date(v.inicioPrevisto), {
    message: "Fim não pode ser antes do início.",
    path: ["fimPrevisto"],
  });
const editarSchema = z
  .object({
    id: z.string().min(1),
    nome: z.string().min(1, "Informe o nome."),
    disciplinaId: opt(z.string()),
    inicioPrevisto: dia,
    fimPrevisto: dia,
    progresso: z.number().int().min(0).max(100),
  })
  .refine((v) => new Date(v.fimPrevisto) >= new Date(v.inicioPrevisto), {
    message: "Fim não pode ser antes do início.",
    path: ["fimPrevisto"],
  });
const idSchema = z.object({ id: z.string().min(1) });
const projetoIdSchema = z.object({ projetoId: z.string().min(1) });
const depSchema = z.object({ tarefaId: z.string().min(1), predecessoraId: z.string().min(1) });
const gerarTarefaSchema = z.object({ eapTarefaId: z.string().min(1) });

/**
 * Ponte EAP → Kanban (one-way). Gera uma Tarefa operacional a partir de uma etapa
 * do cronograma. Mapeamento: nome→titulo, projetoId→projetoId, fimPrevisto→prazo;
 * status = primeira coluna do Kanban (menor ordem, ativa); criador = usuário atual.
 * Não copia dependências nem responsáveis. Pode ser chamada várias vezes para a
 * mesma EapTarefa (não há deduplicação) — cada chamada cria uma nova Tarefa.
 */
export const gerarTarefaDeEap = defineAction(
  { ...plan, acao: "gerar-tarefa-eap", entidade: "Tarefa", schema: gerarTarefaSchema },
  async (i, { user }) => {
    const eap = await prisma.eapTarefa.findUnique({
      where: { id: i.eapTarefaId },
      select: { nome: true, projetoId: true, fimPrevisto: true },
    });
    if (!eap) throw new ActionError("Etapa da EAP não encontrada.");

    const primeira = await prisma.tarefaStatus.findFirst({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      select: { id: true },
    });
    if (!primeira) throw new ActionError("Nenhuma coluna de tarefas configurada.");

    const t = await prisma.tarefa.create({
      data: {
        titulo: eap.nome,
        descricao: "Gerada do planejamento (EAP)",
        statusId: primeira.id,
        prazo: eap.fimPrevisto,
        projetoId: eap.projetoId,
        criadorId: user.id,
      },
    });
    revalidatePath("/tarefas");
    return { id: t.id };
  },
);

export const criarEapTarefa = defineAction(
  { ...plan, acao: "criar-eap", entidade: "EapTarefa", schema: tarefaSchema },
  async (i) => {
    const max = await prisma.eapTarefa.aggregate({
      where: { projetoId: i.projetoId },
      _max: { ordem: true },
    });
    const t = await prisma.eapTarefa.create({
      data: {
        projetoId: i.projetoId,
        parentId: i.parentId || null,
        disciplinaId: i.disciplinaId || null,
        nome: i.nome,
        inicioPrevisto: new Date(i.inicioPrevisto),
        fimPrevisto: new Date(i.fimPrevisto),
        progresso: i.progresso,
        ordem: (max._max.ordem ?? -1) + 1,
      },
    });
    revProjeto(i.projetoId);
    return { id: t.id };
  },
);

export const editarEapTarefa = defineAction(
  { ...plan, acao: "editar-eap", entidade: "EapTarefa", schema: editarSchema },
  async (i) => {
    const t = await prisma.eapTarefa.update({
      where: { id: i.id },
      data: {
        nome: i.nome,
        disciplinaId: i.disciplinaId || null,
        inicioPrevisto: new Date(i.inicioPrevisto),
        fimPrevisto: new Date(i.fimPrevisto),
        progresso: i.progresso,
      },
      select: { projetoId: true },
    });
    revProjeto(t.projetoId);
    return { id: i.id };
  },
);

export const excluirEapTarefa = defineAction(
  { ...plan, acao: "excluir-eap", entidade: "EapTarefa", schema: idSchema },
  async (i) => {
    const t = await prisma.eapTarefa.delete({ where: { id: i.id }, select: { projetoId: true } });
    revProjeto(t.projetoId);
    return { id: i.id };
  },
);

/** Define/redefine a linha de base: copia datas previstas atuais → baseline de TODAS as tarefas. */
export const definirLinhaBase = defineAction(
  { ...plan, acao: "definir-linha-base", entidade: "EapTarefa", schema: projetoIdSchema },
  async (i) => {
    const tarefas = await prisma.eapTarefa.findMany({
      where: { projetoId: i.projetoId },
      select: { id: true, inicioPrevisto: true, fimPrevisto: true },
    });
    if (tarefas.length === 0) throw new ActionError("Adicione tarefas antes de definir a linha de base.");
    await prisma.$transaction(
      tarefas.map((t) =>
        prisma.eapTarefa.update({
          where: { id: t.id },
          data: { inicioBaseline: t.inicioPrevisto, fimBaseline: t.fimPrevisto },
        }),
      ),
    );
    revProjeto(i.projetoId);
    return { total: tarefas.length };
  },
);

/** Aplica o plano à execução: tarefas com disciplina vinculada gravam o prazo da disciplina. */
export const aplicarAoProjeto = defineAction(
  { ...plan, acao: "aplicar-plano", entidade: "Disciplina", schema: projetoIdSchema },
  async (i) => {
    const tarefas = await prisma.eapTarefa.findMany({
      where: { projetoId: i.projetoId, disciplinaId: { not: null } },
      select: { disciplinaId: true, fimPrevisto: true },
    });
    if (tarefas.length === 0) {
      throw new ActionError("Nenhuma tarefa vinculada a disciplina. Vincule disciplinas para aplicar.");
    }
    await prisma.$transaction(
      tarefas.map((t) =>
        prisma.disciplina.update({
          where: { id: t.disciplinaId! },
          data: { prazo: t.fimPrevisto },
        }),
      ),
    );
    revProjeto(i.projetoId);
    revalidatePath(`/projetos/${i.projetoId}`);
    return { aplicadas: tarefas.length };
  },
);

/** Caminho de predecessoras leva a alvo? (detecção de ciclo). */
async function alcanca(deId: string, alvoId: string): Promise<boolean> {
  const visitados = new Set<string>();
  let fronteira = [deId];
  while (fronteira.length > 0) {
    if (fronteira.includes(alvoId)) return true;
    const deps = await prisma.eapDependencia.findMany({
      where: { tarefaId: { in: fronteira } },
      select: { predecessoraId: true },
    });
    fronteira = deps.map((d) => d.predecessoraId).filter((id) => !visitados.has(id));
    fronteira.forEach((id) => visitados.add(id));
  }
  return false;
}

export const vincularDependencia = defineAction(
  { ...plan, acao: "vincular-dep", entidade: "EapDependencia", schema: depSchema },
  async (i) => {
    if (i.tarefaId === i.predecessoraId) throw new ActionError("Tarefa não pode depender dela mesma.");
    const [tarefa, pred] = await Promise.all([
      prisma.eapTarefa.findUnique({ where: { id: i.tarefaId }, select: { projetoId: true } }),
      prisma.eapTarefa.findUnique({ where: { id: i.predecessoraId }, select: { projetoId: true } }),
    ]);
    if (!tarefa || !pred) throw new ActionError("Tarefa não encontrada.");
    if (tarefa.projetoId !== pred.projetoId) throw new ActionError("Dependência deve ser no mesmo projeto.");
    // Vincular tarefa→pred criaria ciclo se pred já alcança tarefa por predecessoras.
    if (await alcanca(i.predecessoraId, i.tarefaId)) {
      throw new ActionError("Dependência criaria um ciclo.");
    }
    await prisma.eapDependencia.create({
      data: { tarefaId: i.tarefaId, predecessoraId: i.predecessoraId },
    });
    revProjeto(tarefa.projetoId);
    return { ok: true };
  },
);

export const removerDependencia = defineAction(
  { ...plan, acao: "remover-dep", entidade: "EapDependencia", schema: depSchema },
  async (i) => {
    const t = await prisma.eapTarefa.findUnique({
      where: { id: i.tarefaId },
      select: { projetoId: true },
    });
    await prisma.eapDependencia.deleteMany({
      where: { tarefaId: i.tarefaId, predecessoraId: i.predecessoraId },
    });
    if (t) revProjeto(t.projetoId);
    return { ok: true };
  },
);

// ── Recursos & Alocações ─────────────────────────────────────

const recursoSchema = z.object({
  userId: z.string().min(1),
  capacidade: z.number().positive("Capacidade deve ser maior que zero.").max(9.99),
  custoHora: z.number().nonnegative().optional(),
  cor: opt(z.string()),
  ativo: z.boolean().default(true),
});
const alocacaoSchema = z.object({
  recursoId: z.string().min(1),
  projetoId: z.string().min(1),
  percentual: z.number().int().min(1, "Mínimo 1%.").max(100, "Máximo 100% por projeto."),
  inicio: opt(z.string()),
  fim: opt(z.string()),
  observacao: opt(z.string()),
});

/** Cria/atualiza o recurso de uma pessoa (capacidade, custo/hora, cor). */
export const salvarRecurso = defineAction(
  { ...rec, acao: "salvar-recurso", entidade: "Recurso", schema: recursoSchema },
  async (i) => {
    const r = await prisma.recurso.upsert({
      where: { userId: i.userId },
      create: {
        userId: i.userId,
        capacidade: i.capacidade,
        custoHora: i.custoHora,
        cor: i.cor || undefined,
        ativo: i.ativo,
      },
      update: {
        capacidade: i.capacidade,
        custoHora: i.custoHora ?? null,
        cor: i.cor || undefined,
        ativo: i.ativo,
      },
    });
    revRecursos();
    return { id: r.id };
  },
);

export const salvarAlocacao = defineAction(
  { ...rec, acao: "salvar-alocacao", entidade: "Alocacao", schema: alocacaoSchema },
  async (i) => {
    if (i.inicio && i.fim && new Date(i.fim) < new Date(i.inicio)) {
      throw new ActionError("Fim não pode ser antes do início.");
    }
    const a = await prisma.alocacao.upsert({
      where: { recursoId_projetoId: { recursoId: i.recursoId, projetoId: i.projetoId } },
      create: {
        recursoId: i.recursoId,
        projetoId: i.projetoId,
        percentual: i.percentual,
        inicio: i.inicio ? new Date(i.inicio) : null,
        fim: i.fim ? new Date(i.fim) : null,
        observacao: i.observacao || null,
      },
      update: {
        percentual: i.percentual,
        inicio: i.inicio ? new Date(i.inicio) : null,
        fim: i.fim ? new Date(i.fim) : null,
        observacao: i.observacao || null,
      },
    });
    revRecursos();
    return { id: a.id };
  },
);

export const removerAlocacao = defineAction(
  { ...rec, acao: "remover-alocacao", entidade: "Alocacao", schema: idSchema },
  async (i) => {
    await prisma.alocacao.delete({ where: { id: i.id } });
    revRecursos();
    return { id: i.id };
  },
);
