"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import { proximoCodigoProjeto, formatarCodigo } from "@/modules/projetos/numbering";
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
  editarDisciplinasEmMassaSchema,
  criarDisciplinaSchema,
  editarDisciplinaSchema,
  excluirDisciplinaSchema,
  cancelarProjetoSchema,
  adicionarDoCatalogoSchema,
} from "@/modules/projetos/schemas";
import { notificar, notificarMuitos } from "@/lib/notificar";

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
          valorContrato: input.valorContrato,
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
        valorContrato: rest.valorContrato,
        // P-03: troca de cliente.
        ...(rest.clienteId ? { clienteId: rest.clienteId } : {}),
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
      include: {
        responsaveis: true,
        projeto: { select: { id: true, codigo: true } },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    // P-11: aprovado é terminal — só via validarEntrega.
    if (input.status === "aprovado") {
      throw new ActionError("Status 'aprovado' só pode ser definido via validação de entrega.");
    }

    const ehGerir = isGlobal(user.role) || ["admin", "supervisor"].includes(user.role);
    const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
    if (!ehGerir && !ehResp) {
      throw new ActionError("Apenas responsáveis ou gestores alteram o status.");
    }

    // P-11: transições permitidas para não-gestores.
    if (!ehGerir) {
      const permitidas: Record<string, string[]> = {
        aguardando: ["em_andamento"],
        em_andamento: ["entregue", "em_revisao"],
        em_revisao: ["em_andamento", "entregue"],
        entregue: ["em_revisao"],
      };
      const atual = disciplina.status;
      if (!(permitidas[atual] ?? []).includes(input.status)) {
        throw new ActionError(
          `Transição de "${atual}" para "${input.status}" não permitida.`,
        );
      }
    }

    const marcaEntregue = input.status === "entregue";
    await prisma.disciplina.update({
      where: { id: input.disciplinaId },
      data: {
        status: input.status,
        // preserva a 1ª data de entrega; limpa se voltar a status pré-entrega.
        entregueEm: marcaEntregue ? (disciplina.entregueEm ?? new Date()) : null,
      },
    });
    revalidatePath(`/projetos/${disciplina.projetoId}`);

    // P-52: notificações por mudança de status.
    const href = `/projetos/${disciplina.projetoId}`;
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    if (input.status === "entregue") {
      // Avisa gestores/supervisores que há uma entrega aguardando validação.
      const validadores = await prisma.user.findMany({
        where: { ativo: true, role: { in: ["admin", "supervisor", "administrativo"] } },
        select: { id: true },
      });
      await notificarMuitos(
        validadores.map((v) => v.id),
        {
          titulo: "Entrega aguardando validação",
          corpo: `${disciplina.nome} (${codigo}) marcada como entregue.`,
          href,
          tag: `entregue-${disciplina.id}`,
        },
      );
    } else if (input.status === "em_revisao") {
      // Avisa responsáveis que revisão foi solicitada.
      const respIds = disciplina.responsaveis.map((r) => r.userId).filter((id) => id !== user.id);
      if (respIds.length > 0) {
        await notificarMuitos(respIds, {
          titulo: "Revisão solicitada",
          corpo: `${disciplina.nome} (${codigo}) requer revisão.`,
          href,
          tag: `revisao-${disciplina.id}`,
        });
      }
    }

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
      select: { projetoId: true, nome: true, projeto: { select: { codigo: true } } },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    const anteriores = await prisma.disciplinaResponsavel.findMany({
      where: { disciplinaId: input.disciplinaId },
      select: { userId: true },
    });
    const anteriorIds = new Set(anteriores.map((r) => r.userId));
    const novosIds = input.responsaveisIds.filter((id) => !anteriorIds.has(id));

    await prisma.$transaction([
      prisma.disciplinaResponsavel.deleteMany({ where: { disciplinaId: input.disciplinaId } }),
      prisma.disciplinaResponsavel.createMany({
        data: input.responsaveisIds.map((userId) => ({ disciplinaId: input.disciplinaId, userId })),
        skipDuplicates: true,
      }),
    ]);
    // P-15: notificar novos responsáveis atribuídos.
    if (novosIds.length > 0) {
      await notificarMuitos(novosIds, {
        titulo: "Você foi atribuído a uma disciplina",
        corpo: `${disciplina.nome} — projeto ${disciplina.projeto.codigo}`,
        href: `/projetos/${disciplina.projetoId}`,
        tag: `resp-${input.disciplinaId}`,
      });
    }
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
        valorContrato: true,
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
          valorContrato: origem.valorContrato,
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

/** P-48: editar várias disciplinas de uma só vez (status, prazo, responsável único). */
export const editarDisciplinasEmMassa = defineAction(
  { modulo: "projetos", acao: "editar-disciplinas-em-massa", recurso: "projetos", permissao: "gerir", schema: editarDisciplinasEmMassaSchema },
  async (input, ctx) => {
    const projeto = await prisma.projeto.findFirst({
      where: { id: input.projetoId, AND: [isGlobal(ctx.user.role) ? {} : { OR: [
        { membros: { some: { userId: ctx.user.id } } },
        { disciplinas: { some: { responsaveis: { some: { userId: ctx.user.id } } } } },
      ] }] },
      select: { id: true },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    const data: Record<string, unknown> = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.prazo !== undefined) data.prazo = input.prazo ? new Date(input.prazo) : null;

    if (Object.keys(data).length > 0) {
      await prisma.disciplina.updateMany({
        where: { id: { in: input.disciplinaIds }, projetoId: input.projetoId },
        data: data as Parameters<typeof prisma.disciplina.updateMany>[0]["data"],
      });
    }

    // Substituir responsável de cada disciplina selecionada.
    if (input.responsavelId !== undefined) {
      for (const disciplinaId of input.disciplinaIds) {
        await prisma.disciplinaResponsavel.deleteMany({ where: { disciplinaId } });
        if (input.responsavelId) {
          await prisma.disciplinaResponsavel.create({
            data: { disciplinaId, userId: input.responsavelId },
          });
        }
      }
    }

    revalidatePath(`/projetos/${input.projetoId}`);
  },
);

// ─── P-02: CRUD de disciplina pós-criação ────────────────────────────────────

export const criarDisciplina = defineAction(
  {
    modulo: "projetos",
    acao: "criar-disciplina",
    recurso: "projetos",
    permissao: "gerir",
    schema: criarDisciplinaSchema,
  },
  async (input) => {
    const projeto = await prisma.projeto.findUnique({
      where: { id: input.projetoId },
      select: { id: true, prazoFinal: true },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    // P-08: prazo da disciplina ≤ prazo do projeto.
    if (input.prazo && projeto.prazoFinal) {
      const prazoD = new Date(input.prazo);
      if (prazoD > projeto.prazoFinal) {
        throw new ActionError(
          `O prazo da disciplina (${input.prazo}) não pode ultrapassar o prazo do projeto (${projeto.prazoFinal.toISOString().slice(0, 10)}).`,
        );
      }
    }

    const maxOrdem = await prisma.disciplina.aggregate({
      where: { projetoId: input.projetoId },
      _max: { ordem: true },
    });

    const disciplina = await prisma.$transaction(async (tx) => {
      const d = await tx.disciplina.create({
        data: {
          projetoId: input.projetoId,
          nome: input.nome,
          prazo: input.prazo ? new Date(input.prazo) : undefined,
          valor: input.valor,
          ordem: (maxOrdem._max.ordem ?? 0) + 1,
        },
      });
      if (input.responsaveisIds.length > 0) {
        await tx.disciplinaResponsavel.createMany({
          data: input.responsaveisIds.map((userId) => ({ disciplinaId: d.id, userId })),
          skipDuplicates: true,
        });
        await notificarMuitos(input.responsaveisIds, {
          titulo: "Você foi atribuído a uma disciplina",
          corpo: `${input.nome} — projeto ${input.projetoId}`,
          href: `/projetos/${input.projetoId}`,
          tag: `resp-${d.id}`,
        });
      }
      return d;
    });

    revalidatePath(`/projetos/${input.projetoId}`);
    return { disciplinaId: disciplina.id };
  },
);

export const editarDisciplina = defineAction(
  {
    modulo: "projetos",
    acao: "editar-disciplina",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "Disciplina",
    schema: editarDisciplinaSchema,
    entidadeId: (d) => (d as { disciplinaId: string }).disciplinaId,
  },
  async (input) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      select: { projetoId: true, projeto: { select: { prazoFinal: true } } },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    // P-08: prazo da disciplina ≤ prazo do projeto.
    if (input.prazo && disciplina.projeto.prazoFinal) {
      if (new Date(input.prazo) > disciplina.projeto.prazoFinal) {
        throw new ActionError(
          `O prazo da disciplina não pode ultrapassar o prazo do projeto.`,
        );
      }
    }

    const anteriorResp = await prisma.disciplinaResponsavel.findMany({
      where: { disciplinaId: input.disciplinaId },
      select: { userId: true },
    });
    const anteriorIds = new Set(anteriorResp.map((r) => r.userId));
    const novosIds = input.responsaveisIds.filter((id) => !anteriorIds.has(id));

    await prisma.$transaction(async (tx) => {
      await tx.disciplina.update({
        where: { id: input.disciplinaId },
        data: {
          nome: input.nome,
          prazo: input.prazo === null ? null : input.prazo ? new Date(input.prazo) : undefined,
          valor: input.valor === null ? null : input.valor,
          ...(input.exigePacoteA !== undefined ? { exigePacoteA: input.exigePacoteA } : {}),
          ...(input.exigePacoteB !== undefined ? { exigePacoteB: input.exigePacoteB } : {}),
        },
      });
      await tx.disciplinaResponsavel.deleteMany({ where: { disciplinaId: input.disciplinaId } });
      if (input.responsaveisIds.length > 0) {
        await tx.disciplinaResponsavel.createMany({
          data: input.responsaveisIds.map((userId) => ({
            disciplinaId: input.disciplinaId,
            userId,
          })),
          skipDuplicates: true,
        });
      }
    });

    if (novosIds.length > 0) {
      await notificarMuitos(novosIds, {
        titulo: "Você foi atribuído a uma disciplina",
        corpo: `${input.nome}`,
        href: `/projetos/${disciplina.projetoId}`,
        tag: `resp-${input.disciplinaId}`,
      });
    }

    revalidatePath(`/projetos/${disciplina.projetoId}`);
    return { disciplinaId: input.disciplinaId };
  },
);

export const excluirDisciplina = defineAction(
  {
    modulo: "projetos",
    acao: "excluir-disciplina",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "Disciplina",
    schema: excluirDisciplinaSchema,
    entidadeId: (d) => (d as { disciplinaId: string }).disciplinaId,
  },
  async (input) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      select: {
        projetoId: true,
        _count: { select: { uploads: true, pagamentos: true } },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");
    if (disciplina._count.uploads > 0)
      throw new ActionError("Não é possível excluir uma disciplina com arquivos enviados.");
    if (disciplina._count.pagamentos > 0)
      throw new ActionError("Não é possível excluir uma disciplina com pagamentos liberados.");

    await prisma.disciplina.delete({ where: { id: input.disciplinaId } });
    revalidatePath(`/projetos/${disciplina.projetoId}`);
  },
);

// ─── P-05: cancelar / arquivar projeto ────────────────────────────────────────

export const cancelarOuArquivarProjeto = defineAction(
  {
    modulo: "projetos",
    acao: "cancelar-projeto",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "Projeto",
    schema: cancelarProjetoSchema,
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
  },
  async (input) => {
    const projeto = await prisma.projeto.findUnique({
      where: { id: input.projetoId },
      select: { id: true, membros: { select: { userId: true } } },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    await prisma.projeto.update({
      where: { id: input.projetoId },
      data: {
        situacao: input.situacao,
        descricao: input.motivo
          ? `[${input.situacao === "cancelado" ? "CANCELADO" : "ARQUIVADO"}] ${input.motivo}`
          : undefined,
      },
    });

    // Notifica membros do projeto.
    const verbo = input.situacao === "cancelado" ? "cancelado" : "arquivado";
    if (projeto.membros.length > 0) {
      await notificarMuitos(
        projeto.membros.map((m) => m.userId),
        {
          titulo: `Projeto ${verbo}`,
          corpo: input.motivo ?? `O projeto foi ${verbo}.`,
          href: `/projetos/${input.projetoId}`,
          tag: `proj-${verbo}-${input.projetoId}`,
        },
      );
    }

    revalidatePath(`/projetos/${input.projetoId}`);
    revalidatePath("/projetos");
  },
);

/** P-09: adiciona disciplinas do catálogo a um projeto, ignorando nomes já existentes. */
export const adicionarDisciplinasDoCatalogo = defineAction(
  {
    modulo: "projetos",
    acao: "adicionar-disciplinas-catalogo",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "Projeto",
    schema: adicionarDoCatalogoSchema,
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
  },
  async (input) => {
    const projeto = await prisma.projeto.findUnique({
      where: { id: input.projetoId },
      select: {
        id: true,
        disciplinas: { select: { nome: true, ordem: true } },
      },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    const nomesExistentes = new Set(projeto.disciplinas.map((d) => d.nome.toLowerCase()));
    const novas = input.nomes.filter((n) => !nomesExistentes.has(n.toLowerCase()));
    if (novas.length === 0) throw new ActionError("Todas as disciplinas selecionadas já existem no projeto.");

    const maxOrdem = Math.max(0, ...projeto.disciplinas.map((d) => d.ordem));
    await prisma.disciplina.createMany({
      data: novas.map((nome, i) => ({
        projetoId: input.projetoId,
        nome,
        ordem: maxOrdem + i + 1,
      })),
    });

    revalidatePath(`/projetos/${input.projetoId}`);
    return { criadas: novas.length };
  },
);
