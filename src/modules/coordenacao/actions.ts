"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { enfileirarConversao } from "@/modules/coordenacao/service";
import { rotuloItemApontamento } from "@/modules/coordenacao/helpers";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";
import {
  converterModeloSchema,
  criarApontamentoSchema,
  editarApontamentoSchema,
  idApontamentoSchema,
  enviarApontamentosSchema,
} from "@/modules/coordenacao/schemas";

const MOTIVO_LABEL: Record<string, string> = {
  nao_ifc: "O arquivo não é um modelo IFC.",
  upload_inexistente: "Arquivo não encontrado.",
  tentativas_esgotadas: "Conversão falhou várias vezes — verifique o arquivo IFC.",
};

/**
 * (Re)converte um modelo IFC para Fragments. Usado no backfill de IFCs antigos
 * (pré-feature) e para re-tentar conversões com erro. Força o reprocessamento
 * (zera o contador de tentativas). O trabalho pesado roda em job pg-boss.
 */
export const converterModelo = defineAction(
  {
    modulo: "coordenacao",
    recurso: "coordenacao",
    permissao: "gerir",
    acao: "converter-modelo",
    entidade: "ConversaoModelo",
    schema: converterModeloSchema,
    entidadeId: (_d, i) => i.uploadId,
  },
  async (input) => {
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: { disciplina: { select: { projetoId: true } } },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");

    const r = await enfileirarConversao(input.uploadId, { forcar: true });
    if (!r.enfileirado && r.motivo !== "sem_worker" && r.motivo !== "em_andamento") {
      throw new ActionError(MOTIVO_LABEL[r.motivo] ?? "Não foi possível enfileirar a conversão.");
    }

    revalidatePath(`/projetos/${upload.disciplina.projetoId}/coordenacao`);
    // `sem_worker`: a linha ficou em `fila` mas não há dev:server/prod rodando os jobs.
    return { enfileirado: r.enfileirado, semWorker: !r.enfileirado && r.motivo === "sem_worker" };
  },
);

// ── Apontamentos de coordenação ─────────────────────────────────

/** Perfil global (admin/supervisor) — override de escrita, igual pendencias. */
function ehGlobal(user: { role: string }) {
  return user.role === "admin" || GLOBAL_ROLES.includes(user.role as Role);
}

/** Exige que o usuário seja responsável da disciplina do apontamento (ou perfil global). */
async function exigirResponsavelOuGlobal(disciplinaId: string, user: SessionUser) {
  if (ehGlobal(user)) return;
  const resp = await prisma.disciplinaResponsavel.findFirst({
    where: { disciplinaId, userId: user.id },
    select: { id: true },
  });
  if (!resp) throw new ActionError("Só um responsável da disciplina pode alterar este apontamento.");
}

function revalidarCoordenacao(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/coordenacao`);
}

const baseGerir = { modulo: "coordenacao", recurso: "coordenacao", permissao: "gerir", entidade: "ApontamentoCoordenacao" } as const;
// Resolver/reabrir: qualquer um com acesso à maquete (coordenacao:ver) pode tentar; o
// vínculo fino (responsável da disciplina, ou perfil global) é checado no handler.
const baseVer = { modulo: "coordenacao", recurso: "coordenacao", permissao: "ver", entidade: "ApontamentoCoordenacao" } as const;

/** Cria um apontamento 3D: elementos (GUIDs) + câmera capturados no viewer. Numeração por projeto. */
export const criarApontamentoCoordenacao = defineAction(
  { ...baseGerir, acao: "criar-apontamento", schema: criarApontamentoSchema, entidadeId: (d) => (d as { id: string }).id },
  async (input, { user }) => {
    const apontamento = await prisma.$transaction(async (tx) => {
      const max = await tx.apontamentoCoordenacao.aggregate({
        where: { projetoId: input.projetoId },
        _max: { numero: true },
      });
      return tx.apontamentoCoordenacao.create({
        data: {
          projetoId: input.projetoId,
          disciplinaId: input.disciplinaId,
          uploadId: input.uploadId,
          numero: (max._max.numero ?? 0) + 1,
          titulo: input.titulo,
          texto: input.texto,
          guids: input.guids,
          camera: input.camera,
          status: "aberta",
          autorId: user.id,
        },
      });
    });
    revalidarCoordenacao(input.projetoId);
    return { id: apontamento.id, numero: apontamento.numero };
  },
);

/** Edita título/texto (autor, enquanto aberto e sem tarefa). */
export const editarApontamentoCoordenacao = defineAction(
  { ...baseGerir, acao: "editar-apontamento", schema: editarApontamentoSchema, entidadeId: (_d, i) => i.id },
  async (input, { user }) => {
    const a = await prisma.apontamentoCoordenacao.findUnique({ where: { id: input.id } });
    if (!a) throw new ActionError("Apontamento não encontrado.");
    if (a.autorId !== user.id && user.role !== "admin") throw new ActionError("Só quem criou o apontamento (ou admin) pode editá-lo.");
    if (a.tarefaId) throw new ActionError("Apontamento já enviado como tarefa — não pode ser editado.");
    if (a.status !== "aberta") throw new ActionError("Só apontamentos abertos podem ser editados.");
    await prisma.apontamentoCoordenacao.update({
      where: { id: a.id },
      data: { titulo: input.titulo, texto: input.texto },
    });
    revalidarCoordenacao(a.projetoId);
    return { id: a.id };
  },
);

/** Exclui um apontamento (autor, enquanto aberto e sem tarefa). */
export const excluirApontamentoCoordenacao = defineAction(
  { ...baseGerir, acao: "excluir-apontamento", schema: idApontamentoSchema, entidadeId: (_d, i) => i.id },
  async (input, { user }) => {
    const a = await prisma.apontamentoCoordenacao.findUnique({ where: { id: input.id } });
    if (!a) throw new ActionError("Apontamento não encontrado.");
    if (a.autorId !== user.id && user.role !== "admin") throw new ActionError("Só quem criou o apontamento (ou admin) pode excluí-lo.");
    if (a.tarefaId) throw new ActionError("Apontamento já vinculado a uma tarefa — não pode ser excluído.");
    await prisma.apontamentoCoordenacao.delete({ where: { id: a.id } });
    revalidarCoordenacao(a.projetoId);
    return { id: a.id };
  },
);

/** Projetista/responsável marca o apontamento como resolvido; sincroniza o item de checklist. */
export const resolverApontamentoCoordenacao = defineAction(
  { ...baseVer, acao: "resolver-apontamento", schema: idApontamentoSchema, entidadeId: (_d, i) => i.id },
  async (input, { user }) => {
    const a = await prisma.apontamentoCoordenacao.findUnique({ where: { id: input.id } });
    if (!a) throw new ActionError("Apontamento não encontrado.");
    await exigirResponsavelOuGlobal(a.disciplinaId, user);
    if (a.status === "fechada" || a.status === "descartada") {
      throw new ActionError("Apontamento já encerrado.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.apontamentoCoordenacao.update({
        where: { id: a.id },
        data: { status: "resolvida", resolvidoPorId: user.id, resolvidoEm: new Date() },
      });
      if (a.tarefaItemId) await tx.tarefaItem.update({ where: { id: a.tarefaItemId }, data: { concluido: true } });
    });
    revalidarCoordenacao(a.projetoId);
    revalidatePath("/tarefas");
    return { id: a.id };
  },
);

/** Reabre um apontamento resolvido (volta a aberta); sincroniza o item de checklist. */
export const reabrirApontamentoCoordenacao = defineAction(
  { ...baseVer, acao: "reabrir-apontamento", schema: idApontamentoSchema, entidadeId: (_d, i) => i.id },
  async (input, { user }) => {
    const a = await prisma.apontamentoCoordenacao.findUnique({ where: { id: input.id } });
    if (!a) throw new ActionError("Apontamento não encontrado.");
    await exigirResponsavelOuGlobal(a.disciplinaId, user);
    if (a.status !== "resolvida") throw new ActionError("Só apontamentos resolvidos podem ser reabertos.");
    await prisma.$transaction(async (tx) => {
      await tx.apontamentoCoordenacao.update({
        where: { id: a.id },
        data: { status: "aberta", resolvidoPorId: null, resolvidoEm: null },
      });
      if (a.tarefaItemId) await tx.tarefaItem.update({ where: { id: a.tarefaItemId }, data: { concluido: false } });
    });
    revalidarCoordenacao(a.projetoId);
    revalidatePath("/tarefas");
    return { id: a.id };
  },
);

/** Encerra o apontamento (aceita a resolução). Marca o item de checklist concluído. */
export const fecharApontamentoCoordenacao = defineAction(
  { ...baseGerir, acao: "fechar-apontamento", schema: idApontamentoSchema, entidadeId: (_d, i) => i.id },
  async (input, { user }) => {
    const a = await prisma.apontamentoCoordenacao.findUnique({ where: { id: input.id } });
    if (!a) throw new ActionError("Apontamento não encontrado.");
    if (a.status === "fechada") return { id: a.id };
    await prisma.$transaction(async (tx) => {
      await tx.apontamentoCoordenacao.update({
        where: { id: a.id },
        data: { status: "fechada", fechadoPorId: user.id, fechadoEm: new Date() },
      });
      if (a.tarefaItemId) await tx.tarefaItem.update({ where: { id: a.tarefaItemId }, data: { concluido: true } });
    });
    revalidarCoordenacao(a.projetoId);
    revalidatePath("/tarefas");
    return { id: a.id };
  },
);

/** Descarta o apontamento (não procede). Marca o item de checklist concluído (sai do trabalho ativo). */
export const descartarApontamentoCoordenacao = defineAction(
  { ...baseGerir, acao: "descartar-apontamento", schema: idApontamentoSchema, entidadeId: (_d, i) => i.id },
  async (input, { user }) => {
    const a = await prisma.apontamentoCoordenacao.findUnique({ where: { id: input.id } });
    if (!a) throw new ActionError("Apontamento não encontrado.");
    if (a.status === "descartada") return { id: a.id };
    await prisma.$transaction(async (tx) => {
      await tx.apontamentoCoordenacao.update({
        where: { id: a.id },
        data: { status: "descartada", fechadoPorId: user.id, fechadoEm: new Date() },
      });
      if (a.tarefaItemId) await tx.tarefaItem.update({ where: { id: a.tarefaItemId }, data: { concluido: true } });
    });
    revalidarCoordenacao(a.projetoId);
    revalidatePath("/tarefas");
    return { id: a.id };
  },
);

/**
 * Fecha a rodada: agrupa os apontamentos abertos (sem tarefa) do projeto em UMA
 * tarefa, cada apontamento vira item de checklist, e notifica responsáveis das
 * disciplinas envolvidas. Espelha enviarApontamentos (pendencias), mas sem
 * "abrir revisão" — apontamento de coordenação não tem esse conceito.
 */
export const enviarApontamentosCoordenacao = defineAction(
  { ...baseGerir, acao: "enviar-apontamentos", entidade: "Tarefa", schema: enviarApontamentosSchema, entidadeId: (d) => (d as { tarefaId: string }).tarefaId },
  async (input, { user }) => {
    const projeto = await prisma.projeto.findUnique({
      where: { id: input.projetoId },
      select: { codigo: true, nome: true },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    const apontamentos = await prisma.apontamentoCoordenacao.findMany({
      where: { projetoId: input.projetoId, status: "aberta", tarefaId: null },
      orderBy: { numero: "asc" },
    });
    if (apontamentos.length === 0) throw new ActionError("Nenhum apontamento novo para enviar.");

    const codigo = formatarCodigo(projeto.codigo);
    const disciplinaIds = [...new Set(apontamentos.map((a) => a.disciplinaId))];
    const responsaveisDisciplinas = await prisma.disciplinaResponsavel.findMany({
      where: { disciplinaId: { in: disciplinaIds } },
      select: { userId: true },
    });
    const responsaveisIds = input.responsaveisIds?.length
      ? input.responsaveisIds
      : [...new Set(responsaveisDisciplinas.map((r) => r.userId))];

    const statusEscolhido = input.statusId
      ? await prisma.tarefaStatus.findUnique({ where: { id: input.statusId }, select: { id: true, concluido: true } })
      : await prisma.tarefaStatus.findFirst({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, concluido: true } });
    if (!statusEscolhido) throw new ActionError("Nenhuma coluna de tarefas configurada.");

    const resumo = `${apontamentos.length} apontamento(s) de coordenação no projeto ${codigo}.`;
    const titulo = input.titulo?.trim() || `Compatibilização · ${codigo} — ${projeto.nome}`;
    const descricao = input.descricao?.trim() || resumo;

    const tarefaId = await prisma.$transaction(async (tx) => {
      const tarefa = await tx.tarefa.create({
        data: {
          titulo,
          descricao,
          statusId: statusEscolhido.id,
          concluidaEm: statusEscolhido.concluido ? new Date() : null,
          prazo: input.prazo ? new Date(input.prazo) : null,
          prioridade: input.prioridade || null,
          projetoId: input.projetoId,
          criadorId: user.id,
          responsaveis: { create: responsaveisIds.map((userId) => ({ userId })) },
          dependeDe: input.dependeDeIds?.length
            ? { create: input.dependeDeIds.map((dependeDeId) => ({ dependeDeId })) }
            : undefined,
        },
      });
      for (let i = 0; i < apontamentos.length; i++) {
        const a = apontamentos[i];
        const item = await tx.tarefaItem.create({
          data: { tarefaId: tarefa.id, descricao: rotuloItemApontamento(a), ordem: i },
        });
        await tx.apontamentoCoordenacao.update({
          where: { id: a.id },
          data: { tarefaId: tarefa.id, tarefaItemId: item.id },
        });
      }
      return tarefa.id;
    });

    const autoresIds = apontamentos.map((a) => a.autorId);
    const destinatarios = [...new Set([...responsaveisIds, ...autoresIds])].filter((id) => id !== user.id);
    if (destinatarios.length > 0) {
      await notificarMuitos(
        destinatarios,
        {
          titulo: "Apontamentos de compatibilização enviados",
          corpo: `${codigo}: ${apontamentos.length} apontamento(s) de coordenação viraram tarefa.`,
          href: "/tarefas",
          tag: `apontamentos-coordenacao-${input.projetoId}`,
        },
        { categoria: "coordenacao" },
      );
    }

    revalidarCoordenacao(input.projetoId);
    revalidatePath("/tarefas");
    return { tarefaId, total: apontamentos.length };
  },
);
