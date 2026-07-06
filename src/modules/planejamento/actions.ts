"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays } from "date-fns";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { reagendarPorDependencias } from "@/modules/planejamento/caminho-critico";

const plan = { modulo: "planejamento", recurso: "planejamento", permissao: "gerir" } as const;
const rec = { modulo: "recursos", recurso: "recursos", permissao: "gerir" } as const;

const revProjeto = (projetoId: string) => {
  revalidatePath(`/planejamento/${projetoId}`);
  revalidatePath("/planejamento");
};
const revRecursos = () => revalidatePath("/recursos");

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));
const dia = z.string().min(1, "Informe a data.");

// ── Roll-up: propaga datas e progresso do filho ao pai ───────
// Tarefas-resumo (com filhas) derivam inicioPrevisto, fimPrevisto e progresso dos filhos.
async function rollupPai(tarefaId: string) {
  const t = await prisma.eapTarefa.findUnique({ where: { id: tarefaId }, select: { parentId: true } });
  if (!t?.parentId) return;
  const irmaos = await prisma.eapTarefa.findMany({
    where: { parentId: t.parentId },
    select: { inicioPrevisto: true, fimPrevisto: true, progresso: true },
  });
  if (irmaos.length === 0) return;
  const minInicio = irmaos.reduce((m, s) => (s.inicioPrevisto < m ? s.inicioPrevisto : m), irmaos[0].inicioPrevisto);
  const maxFim = irmaos.reduce((m, s) => (s.fimPrevisto > m ? s.fimPrevisto : m), irmaos[0].fimPrevisto);
  const avgProgresso = Math.round(irmaos.reduce((sum, s) => sum + s.progresso, 0) / irmaos.length);
  await prisma.eapTarefa.update({
    where: { id: t.parentId },
    data: { inicioPrevisto: minInicio, fimPrevisto: maxFim, progresso: avgProgresso },
  });
  await rollupPai(t.parentId); // propaga hierarquia acima
}

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
    marco: z.boolean().default(false),
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
    marco: z.boolean().default(false),
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
 * Não copia dependências nem responsáveis. Idempotente (P-32): se já existe uma
 * Tarefa gerada desta EapTarefa, devolve-a em vez de criar outra.
 */
export const gerarTarefaDeEap = defineAction(
  { ...plan, acao: "gerar-tarefa-eap", entidade: "Tarefa", schema: gerarTarefaSchema },
  async (i, { user }) => {
    const existente = await prisma.tarefa.findUnique({
      where: { eapTarefaId: i.eapTarefaId },
      select: { id: true },
    });
    if (existente) return { id: existente.id, jaExistia: true };

    const eap = await prisma.eapTarefa.findUnique({
      where: { id: i.eapTarefaId },
      select: { nome: true, projetoId: true, disciplinaId: true, fimPrevisto: true },
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
        disciplinaId: eap.disciplinaId,
        criadorId: user.id,
        eapTarefaId: i.eapTarefaId,
      },
    });
    revalidatePath("/tarefas");
    return { id: t.id, jaExistia: false };
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
        fimPrevisto: i.marco ? new Date(i.inicioPrevisto) : new Date(i.fimPrevisto),
        progresso: i.progresso,
        marco: i.marco,
        ordem: (max._max.ordem ?? -1) + 1,
      },
    });
    await rollupPai(t.id);
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
        fimPrevisto: i.marco ? new Date(i.inicioPrevisto) : new Date(i.fimPrevisto),
        progresso: i.progresso,
        marco: i.marco,
      },
      select: { projetoId: true },
    });
    await rollupPai(i.id);
    revProjeto(t.projetoId);
    return { id: i.id };
  },
);

export const excluirEapTarefa = defineAction(
  { ...plan, acao: "excluir-eap", entidade: "EapTarefa", schema: idSchema },
  async (i) => {
    // Capture parentId before deletion so we can roll up afterward.
    const pre = await prisma.eapTarefa.findUnique({ where: { id: i.id }, select: { parentId: true, projetoId: true } });
    await prisma.eapTarefa.delete({ where: { id: i.id } });
    // Roll up from a sibling to update parent summary (pass parentId itself as anchor).
    if (pre?.parentId) {
      const sibling = await prisma.eapTarefa.findFirst({ where: { parentId: pre.parentId }, select: { id: true } });
      if (sibling) await rollupPai(sibling.id);
    }
    revProjeto(pre!.projetoId);
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
    const [tarefas, todasDiscs] = await Promise.all([
      prisma.eapTarefa.findMany({
        where: { projetoId: i.projetoId, disciplinaId: { not: null } },
        select: { disciplinaId: true, fimPrevisto: true },
      }),
      prisma.disciplina.findMany({
        where: { projetoId: i.projetoId },
        select: { id: true, nome: true },
      }),
    ]);
    if (tarefas.length === 0) {
      throw new ActionError("Nenhuma tarefa vinculada a disciplina. Vincule disciplinas para aplicar.");
    }
    const comEap = new Set(tarefas.map((t) => t.disciplinaId));
    const semEap = todasDiscs.filter((d) => !comEap.has(d.id)).map((d) => d.nome);
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
    return { aplicadas: tarefas.length, semEap };
  },
);

/**
 * P-36: cria uma tarefa de EAP por disciplina que ainda não tem uma (vínculo
 * disciplinaId). Datas: fim = prazo da disciplina (ou prazo final do projeto, ou
 * hoje+14); início = hoje. Bootstrap rápido para sair do "Sem tarefas de EAP".
 */
export const gerarEapDasDisciplinas = defineAction(
  { ...plan, acao: "gerar-eap-disciplinas", entidade: "EapTarefa", schema: projetoIdSchema },
  async (i) => {
    const [disciplinas, existentes, projeto, maxOrdem] = await Promise.all([
      prisma.disciplina.findMany({
        where: { projetoId: i.projetoId },
        orderBy: { ordem: "asc" },
        select: { id: true, nome: true, prazo: true },
      }),
      prisma.eapTarefa.findMany({
        where: { projetoId: i.projetoId, disciplinaId: { not: null } },
        select: { disciplinaId: true },
      }),
      prisma.projeto.findUnique({ where: { id: i.projetoId }, select: { prazoFinal: true } }),
      prisma.eapTarefa.aggregate({ where: { projetoId: i.projetoId }, _max: { ordem: true } }),
    ]);
    const jaComEap = new Set(existentes.map((e) => e.disciplinaId));
    const novas = disciplinas.filter((d) => !jaComEap.has(d.id));
    if (novas.length === 0) throw new ActionError("Todas as disciplinas já têm tarefa na EAP.");

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let ordem = (maxOrdem._max.ordem ?? -1) + 1;
    await prisma.$transaction(
      novas.map((d) => {
        const fim =
          d.prazo && d.prazo > hoje
            ? d.prazo
            : projeto?.prazoFinal && projeto.prazoFinal > hoje
              ? projeto.prazoFinal
              : addDays(hoje, 14);
        return prisma.eapTarefa.create({
          data: {
            projetoId: i.projetoId,
            disciplinaId: d.id,
            nome: d.nome,
            inicioPrevisto: hoje,
            fimPrevisto: fim,
            ordem: ordem++,
          },
        });
      }),
    );
    revProjeto(i.projetoId);
    return { criadas: novas.length };
  },
);

/**
 * P-34: reagenda as tarefas pelas dependências FS (forward pass do CPM), preservando
 * a duração de cada uma. Não-destrutivo: só altera as que mudam de data.
 */
export const reagendarPlano = defineAction(
  { ...plan, acao: "reagendar-plano", entidade: "EapTarefa", schema: projetoIdSchema },
  async (i) => {
    const tarefas = await prisma.eapTarefa.findMany({
      where: { projetoId: i.projetoId },
      select: {
        id: true,
        inicioPrevisto: true,
        fimPrevisto: true,
        predecessoras: { select: { predecessoraId: true } },
      },
    });
    if (tarefas.length === 0) throw new ActionError("Sem tarefas para reagendar.");

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const mudancas = reagendarPorDependencias(
      tarefas.map((t) => ({
        id: t.id,
        inicioPrevisto: iso(t.inicioPrevisto),
        fimPrevisto: iso(t.fimPrevisto),
        predecessoraIds: t.predecessoras.map((p) => p.predecessoraId),
      })),
    );
    if (mudancas.size > 0) {
      await prisma.$transaction(
        [...mudancas.entries()].map(([id, d]) =>
          prisma.eapTarefa.update({
            where: { id },
            data: { inicioPrevisto: new Date(d.inicioPrevisto), fimPrevisto: new Date(d.fimPrevisto) },
          }),
        ),
      );
      revProjeto(i.projetoId);
    }
    return { reagendadas: mudancas.size };
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
