"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import { proximoCodigoProjeto } from "@/modules/projetos/numbering";
import { ensureCanaisProjeto } from "@/modules/chat/service";
import { notificarNovosMembros } from "@/lib/socket";
import {
  criarProjetoSchema,
  editarProjetoSchema,
  atualizarStatusDisciplinaSchema,
  responsaveisDisciplinaSchema,
  registrarRevisaoSchema,
  membrosProjetoSchema,
  duplicarProjetoSchema,
} from "@/modules/projetos/schemas";

function isGlobal(role: Role) {
  return role === "admin" || GLOBAL_ROLES.includes(role);
}

function parseData(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export const criarProjeto = defineAction(
  {
    modulo: "projetos",
    acao: "criar-projeto",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "Projeto",
    schema: criarProjetoSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    const projeto = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: {
          ano,
          sequencial,
          codigo,
          tipo: input.tipo,
          nome: input.nome,
          clienteId: input.clienteId,
          descricao: input.descricao,
          areaM2: input.areaM2,
          endereco: input.endereco,
          prazoFinal: parseData(input.prazoFinal),
          membros: {
            create: input.membrosIds.map((userId) => ({ userId })),
          },
          disciplinas: {
            create: input.disciplinas.map((d, i) => ({
              nome: d.nome,
              prazo: parseData(d.prazo),
              valor: d.valor,
              ordem: i,
              responsaveis: { create: d.responsaveisIds.map((userId) => ({ userId })) },
            })),
          },
        },
      });
    });
    notificarNovosMembros(await ensureCanaisProjeto(projeto.id));
    revalidatePath("/projetos");
    revalidatePath("/planejamento");
    return { id: projeto.id, codigo: projeto.codigo };
  },
);

export const editarProjeto = defineAction(
  {
    modulo: "projetos",
    acao: "editar-projeto",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "Projeto",
    schema: editarProjetoSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    const { id, ...rest } = input;
    await prisma.projeto.update({
      where: { id },
      data: {
        nome: rest.nome,
        tipo: rest.tipo,
        situacao: rest.situacao,
        descricao: rest.descricao,
        areaM2: rest.areaM2,
        endereco: rest.endereco,
        prazoFinal: parseData(rest.prazoFinal),
      },
    });
    revalidatePath("/projetos");
    revalidatePath(`/projetos/${id}`);
    revalidatePath("/planejamento");
    return { id };
  },
);

/** Mudança de status: permitida a perfis globais OU responsável da disciplina. */
export const atualizarStatusDisciplina = defineAction(
  {
    modulo: "projetos",
    acao: "atualizar-status-disciplina",
    recurso: "projetos",
    permissao: "visualizar",
    entidade: "Disciplina",
    schema: atualizarStatusDisciplinaSchema,
    entidadeId: (d) => (d as { disciplinaId: string }).disciplinaId,
  },
  async (input, { user }) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      include: { responsaveis: true },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
    if (!isGlobal(user.role) && !ehResp) {
      throw new ActionError("Apenas responsáveis ou gestores alteram o status.");
    }

    const entregue = input.status === "entregue" || input.status === "aprovado";
    await prisma.disciplina.update({
      where: { id: input.disciplinaId },
      data: {
        status: input.status,
        // marca a entrega (preserva a 1ª data); limpa se voltar a um status não-entregue.
        entregueEm: entregue ? (disciplina.entregueEm ?? new Date()) : null,
      },
    });
    revalidatePath(`/projetos/${disciplina.projetoId}`);
    return { disciplinaId: input.disciplinaId, status: input.status };
  },
);

export const definirResponsaveis = defineAction(
  {
    modulo: "projetos",
    acao: "definir-responsaveis",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "Disciplina",
    schema: responsaveisDisciplinaSchema,
    entidadeId: (d) => (d as { disciplinaId: string }).disciplinaId,
  },
  async (input) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      select: { projetoId: true },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    await prisma.$transaction([
      prisma.disciplinaResponsavel.deleteMany({ where: { disciplinaId: input.disciplinaId } }),
      prisma.disciplinaResponsavel.createMany({
        data: input.responsaveisIds.map((userId) => ({ disciplinaId: input.disciplinaId, userId })),
        skipDuplicates: true,
      }),
    ]);
    // Equipe é derivada (responsáveis das disciplinas ∪ membros manuais), então não escrevemos
    // ProjetoMembro aqui — a exibição reflete a mudança automaticamente.
    // C3-2: sincroniza os canais e faz os novos responsáveis entrarem no room ao vivo.
    notificarNovosMembros(await ensureCanaisProjeto(disciplina.projetoId));
    revalidatePath(`/projetos/${disciplina.projetoId}`);
    return { disciplinaId: input.disciplinaId };
  },
);

/** Registra uma revisão (RVxx). Permitida a globais OU responsável. */
export const registrarRevisao = defineAction(
  {
    modulo: "projetos",
    acao: "registrar-revisao",
    recurso: "projetos",
    permissao: "visualizar",
    entidade: "RevisaoDisciplina",
    schema: registrarRevisaoSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input, { user }) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      include: { responsaveis: true },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");
    const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
    if (!isGlobal(user.role) && !ehResp) {
      throw new ActionError("Apenas responsáveis ou gestores registram revisões.");
    }

    const revisao = await prisma.$transaction(async (tx) => {
      const ultima = await tx.revisaoDisciplina.findFirst({
        where: { disciplinaId: input.disciplinaId },
        orderBy: { numero: "desc" },
      });
      const numero = ultima ? ultima.numero + 1 : 0;
      return tx.revisaoDisciplina.create({
        data: {
          disciplinaId: input.disciplinaId,
          numero,
          motivo: input.motivo,
          autorId: user.id,
        },
      });
    });
    revalidatePath(`/projetos/${disciplina.projetoId}`);
    return { id: revisao.id, numero: revisao.numero };
  },
);

export const definirMembros = defineAction(
  {
    modulo: "projetos",
    acao: "definir-membros",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "ProjetoMembro",
    schema: membrosProjetoSchema,
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
  },
  async (input) => {
    await prisma.$transaction([
      prisma.projetoMembro.deleteMany({ where: { projetoId: input.projetoId } }),
      prisma.projetoMembro.createMany({
        data: input.membrosIds.map((userId) => ({ projetoId: input.projetoId, userId })),
        skipDuplicates: true,
      }),
    ]);
    // C3-2: sincroniza os canais e faz os novos membros entrarem no room ao vivo.
    notificarNovosMembros(await ensureCanaisProjeto(input.projetoId));
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId };
  },
);

/**
 * Duplica um projeto: novo código AAXXXX, nome + " (cópia)", mesmo cliente/tipo e
 * disciplinas (nome/ordem/valor/prazo). Copia responsáveis, membros, EAP e composição
 * de preço conforme as flags recebidas. Uploads/revisões/pagamentos nunca são copiados.
 */
export const duplicarProjeto = defineAction(
  {
    modulo: "projetos",
    acao: "duplicar-projeto",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "Projeto",
    schema: duplicarProjetoSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    const origem = await prisma.projeto.findUnique({
      where: { id: input.id },
      select: {
        tipo: true,
        nome: true,
        clienteId: true,
        descricao: true,
        areaM2: true,
        endereco: true,
        prazoFinal: true,
        membros: { select: { userId: true } },
        disciplinas: {
          orderBy: { ordem: "asc" },
          select: {
            id: true,
            nome: true,
            valor: true,
            prazo: true,
            ordem: true,
            responsaveis: { select: { userId: true } },
          },
        },
        eapTarefas: {
          orderBy: { ordem: "asc" },
          select: {
            id: true,
            parentId: true,
            disciplinaId: true,
            nome: true,
            ordem: true,
            inicioPrevisto: true,
            fimPrevisto: true,
            predecessoras: { select: { predecessoraId: true } },
          },
        },
        composicaoPreco: {
          select: {
            observacao: true,
            itens: {
              orderBy: { ordem: "asc" },
              select: { descricao: true, quantidade: true, valorUnitario: true, ordem: true },
            },
          },
        },
      },
    });
    if (!origem) throw new ActionError("Projeto não encontrado.");

    const novo = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      const criado = await tx.projeto.create({
        data: {
          ano,
          sequencial,
          codigo,
          tipo: origem.tipo,
          nome: `${origem.nome} (cópia)`,
          clienteId: origem.clienteId,
          descricao: origem.descricao,
          areaM2: origem.areaM2,
          endereco: origem.endereco,
          prazoFinal: origem.prazoFinal,
          disciplinas: {
            create: origem.disciplinas.map((d) => ({
              nome: d.nome,
              valor: d.valor,
              prazo: d.prazo,
              ordem: d.ordem,
            })),
          },
        },
      });

      // Mapa oldDisciplinaId → newDisciplinaId (por ordem, que é preservada).
      const novasDisciplinas = await tx.disciplina.findMany({
        where: { projetoId: criado.id },
        orderBy: { ordem: "asc" },
        select: { id: true, ordem: true },
      });
      const dMap = new Map<string, string>();
      for (const orig of origem.disciplinas) {
        const nova = novasDisciplinas.find((d) => d.ordem === orig.ordem);
        if (nova) dMap.set(orig.id, nova.id);
      }

      if (input.copiarResponsaveis) {
        const rows: { disciplinaId: string; userId: string }[] = [];
        for (const d of origem.disciplinas) {
          const newDId = dMap.get(d.id);
          if (!newDId) continue;
          for (const r of d.responsaveis) rows.push({ disciplinaId: newDId, userId: r.userId });
        }
        if (rows.length > 0) await tx.disciplinaResponsavel.createMany({ data: rows, skipDuplicates: true });
      }

      if (input.copiarMembros && origem.membros.length > 0) {
        await tx.projetoMembro.createMany({
          data: origem.membros.map((m) => ({ projetoId: criado.id, userId: m.userId })),
          skipDuplicates: true,
        });
      }

      if (input.copiarEap && origem.eapTarefas.length > 0) {
        const tMap = new Map<string, string>();
        for (const t of origem.eapTarefas) tMap.set(t.id, crypto.randomUUID());
        await tx.eapTarefa.createMany({
          data: origem.eapTarefas.map((t) => ({
            id: tMap.get(t.id)!,
            projetoId: criado.id,
            parentId: t.parentId ? (tMap.get(t.parentId) ?? null) : null,
            disciplinaId: t.disciplinaId ? (dMap.get(t.disciplinaId) ?? null) : null,
            nome: t.nome,
            ordem: t.ordem,
            progresso: 0,
            inicioPrevisto: t.inicioPrevisto,
            fimPrevisto: t.fimPrevisto,
          })),
        });
        const deps: { tarefaId: string; predecessoraId: string }[] = [];
        for (const t of origem.eapTarefas) {
          for (const dep of t.predecessoras) {
            const newT = tMap.get(t.id);
            const newP = tMap.get(dep.predecessoraId);
            if (newT && newP) deps.push({ tarefaId: newT, predecessoraId: newP });
          }
        }
        if (deps.length > 0) await tx.eapDependencia.createMany({ data: deps, skipDuplicates: true });
      }

      if (input.copiarComposicao && origem.composicaoPreco) {
        await tx.projetoComposicaoPreco.create({
          data: {
            projetoId: criado.id,
            observacao: origem.composicaoPreco.observacao,
            itens: {
              create: origem.composicaoPreco.itens.map((item) => ({
                descricao: item.descricao,
                quantidade: item.quantidade,
                valorUnitario: item.valorUnitario,
                ordem: item.ordem,
              })),
            },
          },
        });
      }

      return criado;
    });

    notificarNovosMembros(await ensureCanaisProjeto(novo.id));
    revalidatePath("/projetos");
    revalidatePath("/planejamento");
    return { id: novo.id, codigo: novo.codigo };
  },
);
