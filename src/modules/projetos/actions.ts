"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import { proximoCodigoProjeto } from "@/modules/projetos/numbering";
import { ensureCanaisProjeto } from "@/modules/chat/service";
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
    revalidatePath("/projetos");
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
    return { id };
  },
);

/** Mudança de status: permitida a perfis globais OU responsável da disciplina. */
export const atualizarStatusDisciplina = defineAction(
  {
    modulo: "projetos",
    acao: "atualizar-status-disciplina",
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
    revalidatePath(`/projetos/${disciplina.projetoId}`);
    return { disciplinaId: input.disciplinaId };
  },
);

/** Registra uma revisão (RVxx). Permitida a globais OU responsável. */
export const registrarRevisao = defineAction(
  {
    modulo: "projetos",
    acao: "registrar-revisao",
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
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId };
  },
);

/**
 * Duplica um projeto: novo código AAXXXX, nome + " (cópia)", mesmo cliente/tipo e as
 * disciplinas (nome/ordem/valor/prazo). NÃO copia uploads, revisões, pagamentos,
 * responsáveis nem membros — a cópia nasce "limpa" para uma nova execução.
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
        disciplinas: {
          orderBy: { ordem: "asc" },
          select: { nome: true, valor: true, prazo: true, ordem: true },
        },
      },
    });
    if (!origem) throw new ActionError("Projeto não encontrado.");

    const novo = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
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
              // status fica no default (aguardando); sem responsáveis/uploads/revisões.
            })),
          },
        },
      });
    });

    // Canais de chat do projeto (idempotente), igual ao fluxo de conversão de lead.
    await ensureCanaisProjeto(novo.id);

    revalidatePath("/projetos");
    return { id: novo.id, codigo: novo.codigo };
  },
);
