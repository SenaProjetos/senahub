"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { GLOBAL_ROLES } from "@/lib/roles";
import { whereAudiencia } from "@/lib/audiencias";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { disciplinaUsaPastas } from "@/modules/projetos/estrutura-tipo";
import { liberarPagamentosProjetista } from "@/modules/uploads/pagamento";
import { podeSolicitarAprovacao } from "@/modules/projetos/aprovacao-disciplina/regras";
import { STATUS_LABEL } from "@/modules/projetos/status";
import {
  solicitarAprovacaoDisciplinaSchema,
  confirmarAprovacaoDisciplinaSchema,
  recusarAprovacaoDisciplinaSchema,
} from "@/modules/projetos/schemas";

const CATEGORIA = "aprovacao_disciplina";

/**
 * Passo 1 do fluxo de aprovação em 2 etapas (projetos aprovação/laudo): o responsável
 * marca "projeto aprovado". Disciplina vai para "entregue" com `aprovacaoSolicitadaEm`
 * setado — o rótulo na tela vira "Aguardando confirmação" (ver `rotuloStatusDisciplina`).
 * Confirmação/recusa formal é feita por admin/supervisor via as duas ações abaixo.
 */
export const solicitarAprovacaoDisciplina = defineAction(
  {
    modulo: "projetos",
    acao: "solicitar-aprovacao-disciplina",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Disciplina",
    schema: solicitarAprovacaoDisciplinaSchema,
    entidadeId: (d, i) => ((d ?? i) as { disciplinaId: string }).disciplinaId,
    capturarAntes: (input) =>
      prisma.disciplina.findUnique({
        where: { id: input.disciplinaId },
        select: { status: true, aprovacaoSolicitadaEm: true },
      }),
  },
  async (input, { user }) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      include: {
        responsaveis: true,
        pastas: { select: { origem: true } },
        projeto: { select: { id: true, codigo: true, tipo: true } },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");
    // Gate por DISCIPLINA (não pelo tipo do projeto): disciplinas de aprovação/laudo
    // anteriores à feature de pastas não têm o template e seguem no fluxo A/B legado —
    // a UI esconde este fluxo para elas, então a ação também precisa recusá-lo.
    if (!disciplinaUsaPastas(disciplina.pastas)) {
      throw new ActionError("Esta disciplina não usa o fluxo de aprovação em 2 etapas.");
    }

    const ehResponsavel = disciplina.responsaveis.some((r) => r.userId === user.id);
    if (
      !podeSolicitarAprovacao({
        ehResponsavel,
        status: disciplina.status,
        aprovacaoSolicitadaEm: disciplina.aprovacaoSolicitadaEm,
      })
    ) {
      if (!ehResponsavel) {
        throw new ActionError("Apenas responsáveis pela disciplina podem solicitar aprovação.");
      }
      if (disciplina.aprovacaoSolicitadaEm) {
        throw new ActionError("Já existe uma solicitação de aprovação aguardando confirmação.");
      }
      throw new ActionError(
        `Não é possível solicitar aprovação com a disciplina "${STATUS_LABEL[disciplina.status]}".`,
      );
    }

    const agora = new Date();
    await prisma.disciplina.update({
      where: { id: disciplina.id },
      data: {
        status: "entregue",
        entregueEm: disciplina.entregueEm ?? agora,
        aprovacaoSolicitadaEm: agora,
        aprovacaoSolicitadaPorId: user.id,
      },
    });

    const href = `/projetos/${disciplina.projeto.id}`;
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    const gestores = await prisma.user.findMany({
      where: whereAudiencia("global"),
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      {
        titulo: "Projeto aprovado — aguardando confirmação",
        corpo: `${disciplina.nome} (${codigo}) marcada como aprovada pelo responsável.`,
        href,
        tag: `aprovacao-solicitada-${disciplina.id}`,
      },
      { categoria: CATEGORIA },
    );

    revalidatePath(href);
    revalidatePath("/planejamento/cronograma");
    revalidatePath("/");
    return { disciplinaId: disciplina.id };
  },
);

/** Passo 2 (confirmar): admin/supervisor confirma — disciplina vai a "aprovado" (terminal). */
export const confirmarAprovacaoDisciplina = defineAction(
  {
    modulo: "projetos",
    acao: "confirmar-aprovacao-disciplina",
    recurso: "projetos",
    permissao: "gerir",
    roles: GLOBAL_ROLES,
    entidade: "Disciplina",
    schema: confirmarAprovacaoDisciplinaSchema,
    entidadeId: (d, i) => ((d ?? i) as { disciplinaId: string }).disciplinaId,
    capturarAntes: (input) =>
      prisma.disciplina.findUnique({
        where: { id: input.disciplinaId },
        select: { status: true, aprovacaoSolicitadaEm: true },
      }),
  },
  async (input, { user }) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      include: {
        responsaveis: { include: { user: { select: { id: true, name: true, role: true } } } },
        pagamentos: { select: { id: true } },
        projeto: { select: { id: true, codigo: true, nome: true } },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");
    if (!disciplina.aprovacaoSolicitadaEm) {
      throw new ActionError("Não há solicitação de aprovação em aberto para esta disciplina.");
    }
    if (disciplina.status === "aprovado") {
      throw new ActionError("Esta disciplina já foi aprovada.");
    }

    const agora = new Date();
    const jaTemPagamento = disciplina.pagamentos.length > 0;
    const { pagaveis, salariados } = await prisma.$transaction(async (tx) => {
      await tx.disciplina.update({
        where: { id: disciplina.id },
        data: {
          status: "aprovado",
          entregueEm: agora,
          aprovacaoSolicitadaEm: null,
          aprovacaoSolicitadaPorId: null,
        },
      });
      // Reaprovação pós-revisão já tem pagamento liberado — não gera de novo.
      if (jaTemPagamento) return { pagaveis: [], salariados: [] };
      return liberarPagamentosProjetista(tx, { disciplina, autorId: user.id, agora });
    });

    const href = `/projetos/${disciplina.projeto.id}`;
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    const respIds = disciplina.responsaveis.map((r) => r.userId).filter((id) => id !== user.id);
    if (respIds.length > 0) {
      await notificarMuitos(
        respIds,
        {
          titulo: "Projeto aprovado",
          corpo: `${disciplina.nome} (${codigo}) foi confirmada como aprovada.`,
          href,
          tag: `aprovacao-confirmada-${disciplina.id}`,
        },
        { categoria: CATEGORIA },
      );
    }

    revalidatePath(href);
    revalidatePath("/planejamento/cronograma");
    revalidatePath("/");
    if (!jaTemPagamento) {
      revalidatePath("/financeiro/lancamentos");
      revalidatePath("/financeiro/contas-a-pagar");
    }
    return { disciplinaId: disciplina.id, pagamentos: pagaveis.length + salariados.length };
  },
);

/** Passo 2 (recusar): admin/supervisor recusa — volta para "em_andamento", com motivo. */
export const recusarAprovacaoDisciplina = defineAction(
  {
    modulo: "projetos",
    acao: "recusar-aprovacao-disciplina",
    recurso: "projetos",
    permissao: "gerir",
    roles: GLOBAL_ROLES,
    entidade: "Disciplina",
    schema: recusarAprovacaoDisciplinaSchema,
    entidadeId: (d, i) => ((d ?? i) as { disciplinaId: string }).disciplinaId,
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
    if (!disciplina.aprovacaoSolicitadaEm) {
      throw new ActionError("Não há solicitação de aprovação em aberto para esta disciplina.");
    }

    await prisma.disciplina.update({
      where: { id: disciplina.id },
      data: {
        status: "em_andamento",
        aprovacaoSolicitadaEm: null,
        aprovacaoSolicitadaPorId: null,
      },
    });

    const href = `/projetos/${disciplina.projeto.id}`;
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    const respIds = disciplina.responsaveis.map((r) => r.userId).filter((id) => id !== user.id);
    if (respIds.length > 0) {
      await notificarMuitos(
        respIds,
        {
          titulo: "Aprovação recusada",
          corpo: `${disciplina.nome} (${codigo}): ${input.motivo}`,
          href,
          tag: `aprovacao-recusada-${disciplina.id}`,
        },
        { categoria: CATEGORIA },
      );
    }

    revalidatePath(href);
    revalidatePath("/planejamento/cronograma");
    revalidatePath("/");
    return { disciplinaId: disciplina.id };
  },
);
