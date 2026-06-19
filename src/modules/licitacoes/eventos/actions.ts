"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { registrarHistorico } from "../historico";
import {
  isTipoEvento,
  isAutoria,
  ehRecurso,
  textoEventoHistorico,
  type TipoEventoLicitacao,
} from "./eventos";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");

const criarEventoSchema = z.object({
  licitacaoId: z.string().min(1),
  tipo: z.string().min(1),
  data: z.string().min(1),
  alertaDias: z.array(z.number()).optional(),
  autoria: z.string().optional(),
  protocolo: z.string().optional(),
  observacao: z.string().optional(),
});

const editarEventoSchema = z.object({
  id: z.string().min(1),
  tipo: z.string().min(1),
  data: z.string().min(1),
  alertaDias: z.array(z.number()).optional(),
  autoria: z.string().optional(),
  protocolo: z.string().optional(),
  observacao: z.string().optional(),
});

const concluirEventoSchema = z.object({
  id: z.string().min(1),
  concluido: z.boolean(),
});

const idSchema = z.object({ id: z.string().min(1) });

export const criarEventoLicitacao = defineAction(
  { ...base, acao: "criar-evento-licitacao", entidade: "LicitacaoEvento", schema: criarEventoSchema },
  async (i, { user }) => {
    if (!isTipoEvento(i.tipo)) throw new ActionError("Tipo de evento inválido.");
    const tipo = i.tipo as TipoEventoLicitacao;

    if (i.autoria && !isAutoria(i.autoria)) throw new ActionError("Autoria inválida.");
    const autoria = i.autoria && ehRecurso(tipo) ? i.autoria : null;

    const licitacao = await prisma.licitacao.findUnique({ where: { id: i.licitacaoId } });
    if (!licitacao) throw new ActionError("Licitação não encontrada.");

    const evento = await prisma.$transaction(async (tx) => {
      const ev = await tx.licitacaoEvento.create({
        data: {
          licitacaoId: i.licitacaoId,
          tipo,
          data: new Date(i.data),
          alertaDias: i.alertaDias ?? [],
          autoria,
          protocolo: i.protocolo ?? null,
          observacao: i.observacao ?? null,
        },
      });
      await registrarHistorico(tx, i.licitacaoId, textoEventoHistorico(tipo, i.data, "registrado"), user.id);
      return ev;
    });

    rev();
    return { id: evento.id };
  },
);

export const editarEventoLicitacao = defineAction(
  { ...base, acao: "editar-evento-licitacao", entidade: "LicitacaoEvento", schema: editarEventoSchema },
  async (i, { user }) => {
    const evento = await prisma.licitacaoEvento.findUnique({ where: { id: i.id } });
    if (!evento) throw new ActionError("Evento não encontrado.");

    if (!isTipoEvento(i.tipo)) throw new ActionError("Tipo de evento inválido.");
    const tipo = i.tipo as TipoEventoLicitacao;

    if (i.autoria && !isAutoria(i.autoria)) throw new ActionError("Autoria inválida.");
    const autoria = i.autoria && ehRecurso(tipo) ? i.autoria : null;

    await prisma.$transaction(async (tx) => {
      await tx.licitacaoEvento.update({
        where: { id: i.id },
        data: {
          tipo,
          data: new Date(i.data),
          alertaDias: i.alertaDias ?? [],
          autoria,
          protocolo: i.protocolo ?? null,
          observacao: i.observacao ?? null,
        },
      });
      await registrarHistorico(tx, evento.licitacaoId, textoEventoHistorico(tipo, i.data, "atualizado"), user.id);
    });

    rev();
    return { id: i.id };
  },
);

export const concluirEventoLicitacao = defineAction(
  { ...base, acao: "concluir-evento-licitacao", entidade: "LicitacaoEvento", schema: concluirEventoSchema },
  async (i, { user }) => {
    const evento = await prisma.licitacaoEvento.findUnique({ where: { id: i.id } });
    if (!evento) throw new ActionError("Evento não encontrado.");

    await prisma.$transaction(async (tx) => {
      await tx.licitacaoEvento.update({
        where: { id: i.id },
        data: { concluidoEm: i.concluido ? new Date() : null },
      });
      if (i.concluido) {
        const tipo = evento.tipo as TipoEventoLicitacao;
        const dataISO = evento.data.toISOString().slice(0, 10);
        await registrarHistorico(tx, evento.licitacaoId, textoEventoHistorico(tipo, dataISO, "concluído"), user.id);
      }
    });

    rev();
    return { id: i.id };
  },
);

export const excluirEventoLicitacao = defineAction(
  { ...base, acao: "excluir-evento-licitacao", entidade: "LicitacaoEvento", schema: idSchema },
  async (i, { user }) => {
    const evento = await prisma.licitacaoEvento.findUnique({ where: { id: i.id } });
    if (!evento) throw new ActionError("Evento não encontrado.");

    const tipo = evento.tipo as TipoEventoLicitacao;
    const dataISO = evento.data.toISOString().slice(0, 10);

    await prisma.$transaction(async (tx) => {
      await tx.licitacaoEvento.delete({ where: { id: i.id } });
      await registrarHistorico(tx, evento.licitacaoId, textoEventoHistorico(tipo, dataISO, "removido"), user.id);
    });

    rev();
    return { id: i.id };
  },
);
