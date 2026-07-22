"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";
import { rotuloItemPendencia } from "@/modules/projetos/pendencias/helpers";

// ── Schemas ────────────────────────────────────────────────────
const criarSchema = z.object({
  uploadId: z.string().min(1),
  pagina: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  texto: z.string().trim().min(1, "Descreva a pendência.").max(1000),
});
const editarSchema = z.object({
  id: z.string().min(1),
  texto: z.string().trim().min(1, "Descreva a pendência.").max(1000),
});
const idSchema = z.object({ id: z.string().min(1) });
// Envio dos apontamentos = criação da tarefa. Campos opcionais vêm da janela de confirmação
// (TarefaDialog); quando ausentes, caem nos defaults. O checklist é SEMPRE as pendências
// (montado no servidor), garantindo o vínculo pendência↔item.
const enviarSchema = z.object({
  uploadId: z.string().min(1),
  titulo: z.string().trim().min(1).max(200).optional(),
  descricao: z.string().max(2000).optional(),
  statusId: z.string().optional(),
  prazo: z.string().optional(),
  prioridade: z.string().optional(),
  responsaveisIds: z.array(z.string()).optional(),
  dependeDeIds: z.array(z.string()).optional(),
});

// Gate de validador interno (aponta/fecha/descarta): permissão `uploads:validar`.
const baseValidador = { modulo: "uploads", recurso: "uploads", permissao: "validar", entidade: "Pendencia" } as const;
// Gate de projetista (resolve/reabre): só exige acesso ao projeto; o vínculo fino
// (responsável da disciplina) é checado no handler.
const baseProjetista = { modulo: "uploads", recurso: "projetos", permissao: "ver", entidade: "Pendencia" } as const;

/** Perfil global (admin/supervisor) — override de escrita. NÃO usa ehSocio (piso só de leitura). */
function ehGlobal(user: { role: string }) {
  return user.role === "admin" || GLOBAL_ROLES.includes(user.role as Role);
}

function revalidarViewer(projetoId: string, uploadId: string) {
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
  revalidatePath(`/projetos/${projetoId}/arquivos/${uploadId}/visualizar`);
}

/** Carrega o upload + contexto da disciplina; recusa se a entrega já foi finalizada. */
async function carregarUploadParaApontar(uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      nomeArquivo: true,
      pacote: true,
      versao: true,
      autorId: true,
      disciplinaId: true,
      disciplina: {
        select: {
          status: true,
          projetoId: true,
          nome: true,
          projeto: { select: { codigo: true } },
          responsaveis: { select: { userId: true } },
        },
      },
    },
  });
  if (!upload) throw new ActionError("Arquivo não encontrado.");
  // Disciplina já validada não bloqueia mais: apontar numa entrega aprovada abre revisão
  // (mantém a validação financeira) — tratado em enviarApontamentos.
  return upload;
}

/** Exige que o usuário seja responsável da disciplina (ou perfil global). */
async function exigirResponsavelOuGlobal(disciplinaId: string, user: SessionUser) {
  if (ehGlobal(user)) return;
  const resp = await prisma.disciplinaResponsavel.findFirst({
    where: { disciplinaId, userId: user.id },
    select: { id: true },
  });
  if (!resp) throw new ActionError("Só um responsável da disciplina pode alterar esta pendência.");
}

// ── Apontamentos (validador) ───────────────────────────────────

/** Crava um apontamento posicional na prancha. Numeração sequencial por prancha/rodada (uploadId). */
export const criarPendencia = defineAction(
  { ...baseValidador, acao: "criar-pendencia", schema: criarSchema, entidadeId: (_d, i) => i.uploadId },
  async (input, { user }) => {
    const upload = await carregarUploadParaApontar(input.uploadId);
    // Só a versão vigente recebe pinos novos (apontar em versão obsoleta não faz sentido).
    const maisNova = await prisma.upload.findFirst({
      where: {
        disciplinaId: upload.disciplinaId,
        pacote: upload.pacote,
        nomeArquivo: upload.nomeArquivo,
        versao: { gt: upload.versao },
      },
      select: { id: true },
    });
    if (maisNova) throw new ActionError("Existe versão mais recente deste arquivo — aponte na versão atual.");

    const pend = await prisma.$transaction(async (tx) => {
      const max = await tx.pendencia.aggregate({ where: { uploadId: upload.id }, _max: { numero: true } });
      return tx.pendencia.create({
        data: {
          uploadId: upload.id,
          disciplinaId: upload.disciplinaId,
          projetoId: upload.disciplina.projetoId,
          numero: (max._max.numero ?? 0) + 1,
          pagina: input.pagina,
          x: input.x,
          y: input.y,
          texto: input.texto,
          status: "aberta",
          autorId: user.id,
        },
      });
    });
    revalidarViewer(upload.disciplina.projetoId, upload.id);
    return { id: pend.id, numero: pend.numero, uploadId: upload.id };
  },
);

/** Edita o texto de um apontamento (autor, enquanto aberto e sem tarefa). */
export const editarPendencia = defineAction(
  { ...baseValidador, acao: "editar-pendencia", schema: editarSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Pendência não encontrada.");
    if (p.autorId !== user.id && user.role !== "admin") throw new ActionError("Só quem criou o apontamento (ou admin) pode editá-lo.");
    if (p.tarefaId) throw new ActionError("Pendência já enviada como tarefa — não pode ser editada.");
    if (p.status !== "aberta") throw new ActionError("Só pendências abertas podem ser editadas.");
    await prisma.pendencia.update({ where: { id: p.id }, data: { texto: input.texto } });
    revalidarViewer(p.projetoId, p.uploadId);
    return { id: p.id, projetoId: p.projetoId };
  },
);

/** Exclui um apontamento (autor, enquanto aberto e sem tarefa). */
export const excluirPendencia = defineAction(
  { ...baseValidador, acao: "excluir-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Pendência não encontrada.");
    if (p.autorId !== user.id && user.role !== "admin") throw new ActionError("Só quem criou o apontamento (ou admin) pode excluí-lo.");
    if (p.tarefaId) throw new ActionError("Pendência já vinculada a uma tarefa — não pode ser excluída.");
    await prisma.pendencia.delete({ where: { id: p.id } });
    revalidarViewer(p.projetoId, p.uploadId);
    return { id: p.id, projetoId: p.projetoId };
  },
);

/**
 * Fecha a rodada: agrupa as pendências abertas (sem tarefa) desta prancha em UMA tarefa,
 * cada apontamento vira item de checklist, e notifica os responsáveis. Estende o fluxo de
 * "solicitar ajuste" (marca o arquivo como ajuste solicitado).
 */
export const enviarApontamentos = defineAction(
  { ...baseValidador, acao: "enviar-apontamentos", entidade: "Upload", schema: enviarSchema, entidadeId: (_d, i) => i.uploadId },
  async (input, { user }) => {
    const upload = await carregarUploadParaApontar(input.uploadId);
    const pendencias = await prisma.pendencia.findMany({
      where: { uploadId: upload.id, status: "aberta", tarefaId: null },
      orderBy: { numero: "asc" },
    });
    if (pendencias.length === 0) throw new ActionError("Nenhuma pendência nova para enviar.");

    const { disciplina } = upload;
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    // Responsáveis: os informados na janela de confirmação; senão, os da disciplina.
    const responsaveisIds = input.responsaveisIds?.length
      ? input.responsaveisIds
      : disciplina.responsaveis.map((r) => r.userId);

    // Coluna escolhida (ou 1ª do Kanban por ordem). Guarda `concluido` p/ marcar concluidaEm.
    const statusEscolhido = input.statusId
      ? await prisma.tarefaStatus.findUnique({ where: { id: input.statusId }, select: { id: true, concluido: true } })
      : await prisma.tarefaStatus.findFirst({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, concluido: true } });
    if (!statusEscolhido) throw new ActionError("Nenhuma coluna de tarefas configurada.");

    const resumo = `${pendencias.length} apontamento(s) na prancha ${upload.nomeArquivo}.`;
    const titulo = input.titulo?.trim() || `Ajustes · ${upload.nomeArquivo} (${disciplina.nome} — ${codigo})`;
    const descricao = input.descricao?.trim() || resumo;
    // Entrega já validada: apontar reabre a disciplina em REVISÃO, mas mantém a validação
    // financeira (pagamentos ficam intactos) e registra a revisão (RVxx).
    const eraAprovada = disciplina.status === "aprovado";

    const { tarefaId, revisaoNumero } = await prisma.$transaction(async (tx) => {
      const tarefa = await tx.tarefa.create({
        data: {
          titulo,
          descricao,
          statusId: statusEscolhido.id,
          concluidaEm: statusEscolhido.concluido ? new Date() : null,
          prazo: input.prazo ? new Date(input.prazo) : null,
          prioridade: input.prioridade || null,
          projetoId: disciplina.projetoId,
          disciplinaId: upload.disciplinaId,
          criadorId: user.id,
          responsaveis: { create: responsaveisIds.map((userId) => ({ userId })) },
          dependeDe: input.dependeDeIds?.length
            ? { create: input.dependeDeIds.map((dependeDeId) => ({ dependeDeId })) }
            : undefined,
        },
      });
      // Um item por pendência, preservando número/ordem, e vincula de volta (deep-link/sync).
      for (let i = 0; i < pendencias.length; i++) {
        const p = pendencias[i];
        const item = await tx.tarefaItem.create({
          data: { tarefaId: tarefa.id, descricao: rotuloItemPendencia(p), ordem: i },
        });
        await tx.pendencia.update({ where: { id: p.id }, data: { tarefaId: tarefa.id, tarefaItemId: item.id } });
      }
      // Marca o arquivo como "ajuste solicitado" (mesmo badge da validação parcial).
      await tx.upload.update({
        where: { id: upload.id },
        data: { validado: false, validadoPorId: null, validadoEm: null, revisaoObs: resumo, revisaoEm: new Date(), revisaoPorId: user.id },
      });

      let revisaoNumero: number | null = null;
      if (eraAprovada) {
        // Abre revisão SEM tocar nos pagamentos (validação financeira preservada).
        await tx.disciplina.update({ where: { id: upload.disciplinaId }, data: { status: "em_revisao" } });
        const ultima = await tx.revisaoDisciplina.findFirst({
          where: { disciplinaId: upload.disciplinaId },
          orderBy: { numero: "desc" },
          select: { numero: true },
        });
        revisaoNumero = ultima ? ultima.numero + 1 : 0;
        await tx.revisaoDisciplina.create({
          data: { disciplinaId: upload.disciplinaId, numero: revisaoNumero, motivo: resumo, autorId: user.id },
        });
      }
      return { tarefaId: tarefa.id, revisaoNumero };
    });

    const destinatarios = [...new Set([...responsaveisIds, upload.autorId])].filter((id) => id !== user.id);
    if (destinatarios.length > 0) {
      await notificarMuitos(destinatarios, {
        titulo: eraAprovada ? "Revisão aberta na prancha" : "Ajustes solicitados na prancha",
        corpo:
          `${upload.nomeArquivo} (${disciplina.nome} · ${codigo}): ${pendencias.length} apontamento(s)` +
          (revisaoNumero != null ? ` — revisão R${revisaoNumero} aberta.` : "."),
        href: "/tarefas",
        tag: `pendencias-${upload.id}`,
      });
    }

    revalidarViewer(disciplina.projetoId, upload.id);
    revalidatePath("/tarefas");
    revalidatePath(`/projetos/${disciplina.projetoId}`);
    return { tarefaId, uploadId: upload.id, total: pendencias.length, revisaoAberta: revisaoNumero };
  },
);

// ── Ciclo de vida (projetista / validador) ─────────────────────

/** Projetista marca a pendência como resolvida; sincroniza o item de checklist. */
export const resolverPendencia = defineAction(
  { ...baseProjetista, acao: "resolver-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Pendência não encontrada.");
    await exigirResponsavelOuGlobal(p.disciplinaId, user);
    if (p.status === "fechada" || p.status === "descartada") {
      throw new ActionError("Pendência já encerrada pelo validador.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.pendencia.update({
        where: { id: p.id },
        data: { status: "resolvida", resolvidoPorId: user.id, resolvidoEm: new Date() },
      });
      if (p.tarefaItemId) await tx.tarefaItem.update({ where: { id: p.tarefaItemId }, data: { concluido: true } });
    });
    revalidarViewer(p.projetoId, p.uploadId);
    revalidatePath("/tarefas");
    return { id: p.id, projetoId: p.projetoId };
  },
);

/** Projetista reabre uma pendência resolvida (volta a aberta); sincroniza o item de checklist. */
export const reabrirPendencia = defineAction(
  { ...baseProjetista, acao: "reabrir-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Pendência não encontrada.");
    await exigirResponsavelOuGlobal(p.disciplinaId, user);
    if (p.status !== "resolvida") throw new ActionError("Só pendências resolvidas podem ser reabertas.");
    await prisma.$transaction(async (tx) => {
      await tx.pendencia.update({
        where: { id: p.id },
        data: { status: "aberta", resolvidoPorId: null, resolvidoEm: null },
      });
      if (p.tarefaItemId) await tx.tarefaItem.update({ where: { id: p.tarefaItemId }, data: { concluido: false } });
    });
    revalidarViewer(p.projetoId, p.uploadId);
    revalidatePath("/tarefas");
    return { id: p.id, projetoId: p.projetoId };
  },
);

/** Validador encerra a pendência (aceita a resolução). Marca o item de checklist concluído. */
export const fecharPendencia = defineAction(
  { ...baseValidador, acao: "fechar-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Pendência não encontrada.");
    if (p.status === "fechada") return { id: p.id, projetoId: p.projetoId };
    await prisma.$transaction(async (tx) => {
      await tx.pendencia.update({
        where: { id: p.id },
        data: { status: "fechada", fechadoPorId: user.id, fechadoEm: new Date() },
      });
      if (p.tarefaItemId) await tx.tarefaItem.update({ where: { id: p.tarefaItemId }, data: { concluido: true } });
    });
    revalidarViewer(p.projetoId, p.uploadId);
    revalidatePath("/tarefas");
    return { id: p.id, projetoId: p.projetoId };
  },
);

/** Validador descarta a pendência (não procede). Marca o item de checklist concluído (sai do trabalho ativo). */
export const descartarPendencia = defineAction(
  { ...baseValidador, acao: "descartar-pendencia", schema: idSchema, entidadeId: (d) => (d as { projetoId: string }).projetoId },
  async (input, { user }) => {
    const p = await prisma.pendencia.findUnique({ where: { id: input.id } });
    if (!p) throw new ActionError("Pendência não encontrada.");
    if (p.status === "descartada") return { id: p.id, projetoId: p.projetoId };
    await prisma.$transaction(async (tx) => {
      await tx.pendencia.update({
        where: { id: p.id },
        data: { status: "descartada", fechadoPorId: user.id, fechadoEm: new Date() },
      });
      if (p.tarefaItemId) await tx.tarefaItem.update({ where: { id: p.tarefaItemId }, data: { concluido: true } });
    });
    revalidarViewer(p.projetoId, p.uploadId);
    revalidatePath("/tarefas");
    return { id: p.id, projetoId: p.projetoId };
  },
);
