"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { defineAction, ActionError } from "@/lib/with-action";
import { avisarPendenciaFeita, avisarPendenciaReaberta, avisarPublicacao, avisarRespostaAta, avisarTarefasNovas } from "./avisos";
import { MOTIVO_NAO_ENCONTRADA, MOTIVO_PENDENCIA_NAO_ENCONTRADA } from "./regras";
import {
  criarAtaDeTextoSchema,
  marcarFeitaSchema,
  pendenciaSchema,
  reabrirPendenciaSchema,
  responderAtaSchema,
  retirarAtaSchema,
  reuniaoSchema,
  salvarRascunhoSchema,
  versaoSchema,
} from "./schemas";
import {
  conferirPendencia,
  corrigirAta as corrigirAtaNoBanco,
  criarReuniaoComRascunho,
  descartarRascunho,
  marcarPendenciaFeita as marcarPendenciaFeitaNoBanco,
  publicar,
  reabrirPendencia,
  responderAta as responderAtaNoBanco,
  retirarAta as retirarAtaNoBanco,
  salvarRascunho,
} from "./service";

/**
 * Atas de reunião (spec `docs/superpowers/specs/2026-11-22-portal-atas-reuniao-design.md`). As da EQUIPE são
 * `interno: true` e a audiência da conversa com a coordenação é conferida no serviço; as do CLIENTE não têm permissão de
 * catálogo (conta externa aqui, porta do portal no serviço). Avisos depois do commit, sem nunca derrubar a escrita.
 */

async function semFalhar(rotulo: string, f: () => Promise<unknown>): Promise<void> {
  try {
    await f();
  } catch (e) {
    console.error(`[atas] ${rotulo} falhou:`, e);
  }
}

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/cliente`);
  revalidatePath(`/portal/${projetoId}`);
}

const versaoAntes = (input: { versaoId: string }) =>
  prisma.ataVersao.findUnique({ where: { id: input.versaoId }, select: { id: true, reuniaoId: true, numero: true, estado: true, resposta: true } });
const reuniaoAntes = (input: { reuniaoId: string }) =>
  prisma.reuniaoProjeto.findUnique({ where: { id: input.reuniaoId }, select: { id: true, projetoId: true, titulo: true, data: true, retiradaEm: true } });
const pendenciaAntes = (input: { pendenciaId: string }) =>
  prisma.pendenciaCliente.findUnique({ where: { id: input.pendenciaId }, select: { id: true, projetoId: true, titulo: true, situacao: true } });

const equipe = (user: { id: string; name: string }) => ({ userId: user.id, nome: user.name });

// ── Equipe ─────────────────────────────────────────────────────────────────────────────────

export const criarAtaDeTexto = defineAction(
  {
    modulo: "portal",
    acao: "ata-criar",
    entidade: "ReuniaoProjeto",
    interno: true,
    schema: criarAtaDeTextoSchema,
    // O texto colado (anotações da reunião com o cliente) não vai para a auditoria.
    redact: ["texto"],
    entidadeId: (data) => (data as { reuniaoId: string }).reuniaoId,
  },
  async (input, { user }) => {
    const r = await criarReuniaoComRascunho({ projetoId: input.projetoId, quem: equipe(user), titulo: input.titulo ?? null, data: input.data ?? null, texto: input.texto, agendadaId: input.agendadaId ?? null });
    revalidar(input.projetoId);
    return { reuniaoId: r.reuniaoId };
  },
);

export const salvarRascunhoAta = defineAction(
  {
    modulo: "portal",
    acao: "ata-salvar-rascunho",
    entidade: "AtaVersao",
    interno: true,
    schema: salvarRascunhoSchema,
    redact: ["texto", "itens"],
    entidadeId: (_data, input) => input.versaoId,
  },
  async (input, { user }) => {
    const r = await salvarRascunho({ versaoId: input.versaoId, quem: equipe(user), texto: input.texto, itens: input.itens, titulo: input.titulo, data: input.data });
    return { reuniaoId: r.reuniaoId };
  },
);

export const descartarRascunhoAta = defineAction(
  {
    modulo: "portal",
    acao: "ata-descartar-rascunho",
    entidade: "AtaVersao",
    interno: true,
    schema: versaoSchema,
    capturarAntes: versaoAntes,
    entidadeId: (_data, input) => input.versaoId,
  },
  async (input, { user }) => {
    const r = await descartarRascunho({ versaoId: input.versaoId, quem: equipe(user) });
    revalidar(r.projetoId);
    return { projetoId: r.projetoId, reuniaoApagada: r.reuniaoApagada };
  },
);

export const publicarAta = defineAction(
  {
    modulo: "portal",
    acao: "ata-publicar",
    entidade: "AtaVersao",
    interno: true,
    schema: versaoSchema,
    capturarAntes: versaoAntes,
    entidadeId: (_data, input) => input.versaoId,
  },
  async (input, { user }) => {
    const r = await publicar({ versaoId: input.versaoId, quem: equipe(user) });
    await semFalhar("aviso da publicação", () => avisarPublicacao(input.versaoId));
    await semFalhar("aviso das tarefas", () => avisarTarefasNovas(r.tarefasNovas.filter((t) => t.responsavelId !== user.id)));
    revalidar(r.projetoId);
    revalidatePath("/tarefas");
    // Vai para a auditoria (o `novo` da ação): quais Tarefas a publicação criou, mudou de responsável ou arquivou.
    return { projetoId: r.projetoId, tarefas: r.tarefasNovas.map((t) => t.tarefaId), tarefasArquivadas: r.tarefasArquivadas };
  },
);

export const corrigirAta = defineAction(
  {
    modulo: "portal",
    acao: "ata-corrigir",
    entidade: "ReuniaoProjeto",
    interno: true,
    schema: reuniaoSchema,
    capturarAntes: reuniaoAntes,
    entidadeId: (_data, input) => input.reuniaoId,
  },
  async (input, { user }) => {
    const r = await corrigirAtaNoBanco({ reuniaoId: input.reuniaoId, quem: equipe(user) });
    revalidar(r.projetoId);
    return { versaoId: r.versaoId };
  },
);

export const retirarAta = defineAction(
  {
    modulo: "portal",
    acao: "ata-retirar",
    entidade: "ReuniaoProjeto",
    interno: true,
    schema: retirarAtaSchema,
    capturarAntes: reuniaoAntes,
    entidadeId: (_data, input) => input.reuniaoId,
  },
  async (input, { user }) => {
    const r = await retirarAtaNoBanco({ reuniaoId: input.reuniaoId, quem: equipe(user), motivo: input.motivo });
    revalidar(r.projetoId);
    revalidatePath("/tarefas");
    return { ok: true };
  },
);

export const conferirPendenciaCliente = defineAction(
  {
    modulo: "portal",
    acao: "ata-pendencia-conferir",
    entidade: "PendenciaCliente",
    interno: true,
    schema: pendenciaSchema,
    capturarAntes: pendenciaAntes,
    entidadeId: (_data, input) => input.pendenciaId,
  },
  async (input, { user }) => {
    const r = await conferirPendencia({ pendenciaId: input.pendenciaId, quem: equipe(user) });
    revalidar(r.projetoId);
    return { ok: true };
  },
);

export const reabrirPendenciaCliente = defineAction(
  {
    modulo: "portal",
    acao: "ata-pendencia-reabrir",
    entidade: "PendenciaCliente",
    interno: true,
    schema: reabrirPendenciaSchema,
    capturarAntes: pendenciaAntes,
    entidadeId: (_data, input) => input.pendenciaId,
  },
  async (input, { user }) => {
    const r = await reabrirPendencia({ pendenciaId: input.pendenciaId, quem: equipe(user), motivo: input.motivo });
    await semFalhar("aviso da reabertura", () => avisarPendenciaReaberta(input.pendenciaId));
    revalidar(r.projetoId);
    return { ok: true };
  },
);

// ── Cliente ────────────────────────────────────────────────────────────────────────────────

export const responderAta = defineAction(
  {
    modulo: "portal",
    acao: "ata-responder",
    entidade: "AtaVersao",
    schema: responderAtaSchema,
    entidadeId: (_data, input) => input.versaoId,
  },
  async (input, { user }) => {
    if (user.tipo !== "externo") throw new ActionError(MOTIVO_NAO_ENCONTRADA);
    const r = await responderAtaNoBanco({ versaoId: input.versaoId, conta: { userId: user.id, nome: user.name }, resposta: input.resposta, observacao: input.observacao ?? null });
    await semFalhar("aviso da resposta", () => avisarRespostaAta(input.versaoId));
    revalidar(r.projetoId);
    return { ok: true };
  },
);

export const marcarPendenciaFeita = defineAction(
  {
    modulo: "portal",
    acao: "ata-pendencia-feita",
    entidade: "PendenciaCliente",
    schema: marcarFeitaSchema,
    entidadeId: (_data, input) => input.pendenciaId,
  },
  async (input, { user }) => {
    if (user.tipo !== "externo") throw new ActionError(MOTIVO_PENDENCIA_NAO_ENCONTRADA);
    const r = await marcarPendenciaFeitaNoBanco({ pendenciaId: input.pendenciaId, conta: { userId: user.id, nome: user.name }, comentario: input.comentario ?? null });
    await semFalhar("aviso da pendência feita", () => avisarPendenciaFeita(input.pendenciaId));
    revalidar(r.projetoId);
    return { ok: true };
  },
);
