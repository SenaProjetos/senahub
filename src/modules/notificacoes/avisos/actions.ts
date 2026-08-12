"use server";

import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { criarAvisoSchema } from "./schemas";
import { resolverDestinatarios, rolesValidas, dispatcharAviso } from "./service";
import { validarAgendamentoAviso } from "./agendamento";
import { avisosPendentes } from "./queries";

/**
 * Cria um aviso geral direcionado — imediato ou agendado (`agendadoPara`).
 *
 * Imediato: persiste o aviso já marcado como enviado e dispara na hora
 * (destinatários + sino/push + modal ao vivo + e-mail opcional).
 * Agendado: persiste só o aviso com o alvo; o job `avisos-agendados` resolve os
 * destinatários e dispara na hora marcada — por isso nenhum AvisoDestinatario é
 * criado antes, o que também impede o modal de vazar antes do tempo.
 */
export const criarAviso = defineAction(
  {
    modulo: "configuracoes",
    recurso: "avisos",
    permissao: "enviar",
    acao: "criar-aviso",
    entidade: "Aviso",
    schema: criarAvisoSchema,
    entidadeId: (data) => (data as { id?: string }).id,
  },
  async (i, ctx) => {
    // Prévia do alvo: falha cedo (e informa o tamanho) mesmo no agendamento, ainda
    // que a lista definitiva só seja resolvida no disparo.
    const previa = await resolverDestinatarios(i, ctx.user.id);
    if (previa.length === 0) {
      throw new ActionError("Nenhum destinatário para o alvo escolhido.");
    }

    const agendamento = i.agendadoPara ? validarAgendamentoAviso(i.agendadoPara) : null;
    if (agendamento && !agendamento.ok) throw new ActionError(agendamento.erro);
    const quando = agendamento?.ok ? agendamento.date : null;

    const aviso = await prisma.aviso.create({
      data: {
        titulo: i.titulo,
        corpo: i.corpo || null,
        imagemPath: i.imagemPath || null,
        criadoPorId: ctx.user.id,
        alvoTipo: i.alvoTipo,
        alvoRoles: i.alvoTipo === "categoria" ? rolesValidas(i.alvoRoles) : [],
        alvoUserIds: i.alvoTipo === "usuarios" ? i.userIds : [],
        incluirClientes: i.incluirClientes,
        exigeConfirmacao: i.exigeConfirmacao,
        emailSolicitado: i.enviarEmail,
        agendadoPara: quando,
        enviadoEm: quando ? null : new Date(),
      },
    });

    if (quando) {
      return {
        id: aviso.id,
        agendado: true as const,
        agendadoPara: quando.toISOString(),
        total: previa.length,
        comEmail: 0,
      };
    }

    const r = await dispatcharAviso(aviso.id);
    return { id: aviso.id, agendado: false as const, agendadoPara: null, ...r };
  },
);

/** Cancela um aviso agendado antes do disparo (não desfaz aviso já enviado). */
export const cancelarAvisoAgendado = defineAction(
  {
    modulo: "configuracoes",
    recurso: "avisos",
    permissao: "enviar",
    acao: "cancelar-aviso-agendado",
    entidade: "Aviso",
    schema: z.object({ id: z.string().min(1) }),
    entidadeId: (data) => (data as { id?: string }).id,
    capturarAntes: async (input) => prisma.aviso.findUnique({ where: { id: input.id } }),
  },
  async (i) => {
    const { count } = await prisma.aviso.updateMany({
      where: { id: i.id, enviadoEm: null, canceladoEm: null },
      data: { canceladoEm: new Date() },
    });
    if (count !== 1) throw new ActionError("Este aviso já foi enviado ou cancelado.");
    return { id: i.id };
  },
);

/** Confirma leitura do aviso para o usuário atual (idempotente). */
export async function confirmarLeituraAviso(avisoId: string) {
  const session = await getSession();
  if (!session) return { ok: false };
  await prisma.avisoDestinatario.updateMany({
    where: { avisoId, userId: session.user.id, lidoEm: null },
    data: { lidoEm: new Date() },
  });
  return { ok: true };
}

/** Fila de avisos pendentes do usuário atual (usada pelo provider client). */
export async function buscarAvisosPendentes() {
  const session = await getSession();
  if (!session) return [];
  return avisosPendentes(session.user.id);
}
