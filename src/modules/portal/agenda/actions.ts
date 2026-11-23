"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { defineAction } from "@/lib/with-action";
import { agendarReuniaoSchema, cancelarReuniaoSchema, editarReuniaoSchema, removerNotaSchema, salvarNotaSchema } from "./schemas";
import { agendarReuniao, cancelarReuniao, editarReuniao, removerNota, salvarNota } from "./service";

/**
 * Agenda do portal (spec `docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md`). Tudo aqui é da EQUIPE:
 * `interno: true` e a audiência da conversa com a coordenação é conferida no serviço. O texto da nota sai ao cliente e não
 * vai para a auditoria (`redact`).
 */

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/cliente`);
  revalidatePath(`/portal/${projetoId}`);
}

export const salvarNotaDoMarco = defineAction(
  {
    modulo: "portal",
    acao: "agenda-nota-salvar",
    entidade: "MarcoAgendaPortal",
    interno: true,
    schema: salvarNotaSchema,
    redact: ["nota"],
    entidadeId: (_data, input) => input.marcoId,
  },
  async (input, { user }) => {
    await salvarNota({ projetoId: input.projetoId, marcoId: input.marcoId, nota: input.nota, userId: user.id });
    revalidar(input.projetoId);
    return { marcoId: input.marcoId };
  },
);

export const removerNotaDoMarco = defineAction(
  {
    modulo: "portal",
    acao: "agenda-nota-remover",
    entidade: "MarcoAgendaPortal",
    interno: true,
    schema: removerNotaSchema,
    entidadeId: (_data, input) => input.marcoId,
  },
  async (input, { user }) => {
    await removerNota({ projetoId: input.projetoId, marcoId: input.marcoId, userId: user.id });
    revalidar(input.projetoId);
    return { marcoId: input.marcoId };
  },
);

// ── Reuniões agendadas ─────────────────────────────────────────────────────────────────────

const reuniaoAntes = (input: { reuniaoAgendadaId: string }) =>
  prisma.reuniaoAgendada.findUnique({
    where: { id: input.reuniaoAgendadaId },
    select: { id: true, projetoId: true, dia: true, horaInicio: true, estado: true },
  });

export const agendarReuniaoDoProjeto = defineAction(
  {
    modulo: "portal",
    acao: "agenda-reuniao-agendar",
    entidade: "ReuniaoAgendada",
    interno: true,
    schema: agendarReuniaoSchema,
    // Título, local, pauta e link saem ao cliente e não vão para a auditoria.
    redact: ["titulo", "local", "pauta", "link"],
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, { user }) => {
    const r = await agendarReuniao({
      projetoId: input.projetoId,
      titulo: input.titulo,
      dia: input.dia,
      horaInicio: input.horaInicio,
      duracaoMinutos: input.duracaoMinutos ?? null,
      link: input.link ?? null,
      local: input.local ?? null,
      pauta: input.pauta ?? null,
      userId: user.id,
    });
    revalidar(input.projetoId);
    return { id: r.id };
  },
);

export const editarReuniaoAgendada = defineAction(
  {
    modulo: "portal",
    acao: "agenda-reuniao-editar",
    entidade: "ReuniaoAgendada",
    interno: true,
    schema: editarReuniaoSchema,
    redact: ["titulo", "local", "pauta", "link"],
    capturarAntes: reuniaoAntes,
    entidadeId: (_data, input) => input.reuniaoAgendadaId,
  },
  async (input, { user }) => {
    const r = await editarReuniao({
      id: input.reuniaoAgendadaId,
      titulo: input.titulo,
      dia: input.dia,
      horaInicio: input.horaInicio,
      duracaoMinutos: input.duracaoMinutos ?? null,
      link: input.link ?? null,
      local: input.local ?? null,
      pauta: input.pauta ?? null,
      userId: user.id,
    });
    revalidar(r.projetoId);
    return { projetoId: r.projetoId };
  },
);

export const cancelarReuniaoAgendada = defineAction(
  {
    modulo: "portal",
    acao: "agenda-reuniao-cancelar",
    entidade: "ReuniaoAgendada",
    interno: true,
    schema: cancelarReuniaoSchema,
    redact: ["motivo"],
    capturarAntes: reuniaoAntes,
    entidadeId: (_data, input) => input.reuniaoAgendadaId,
  },
  async (input, { user }) => {
    const r = await cancelarReuniao({ id: input.reuniaoAgendadaId, motivo: input.motivo ?? null, userId: user.id });
    revalidar(r.projetoId);
    return { projetoId: r.projetoId };
  },
);
