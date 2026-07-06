"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { INTERNAL_ROLES } from "@/lib/roles";
import { notificar } from "@/lib/notificar";
import { aplicarBatida, editarDia } from "@/modules/ponto/service";
import { espelhoDetalhado } from "@/modules/ponto/queries";
import { diaLocal } from "@/modules/ponto/engine";
import {
  ajustePontoProprioSchema,
  ajustePontoEquipeSchema,
  cienciaAjusteSchema,
  contestarAjusteSchema,
} from "@/modules/ponto/schemas";
import type { Prisma } from "@/generated/prisma/client";

const base = { modulo: "rh" } as const;
const rev = () => revalidatePath("/ponto");

const projetoOpt = z.string().optional().or(z.literal(""));

const geoSchema = z
  .object({
    lat: z.number(),
    lng: z.number(),
    accuracy: z.number().optional(),
  })
  .nullable()
  .optional();

const registrarBatidaSchema = z.object({
  tipo: z.enum(["entrada", "inicio_descanso", "fim_descanso", "saida"]),
  projetoId: projetoOpt,
  geo: geoSchema,
  /**
   * Timestamp do CLIENTE (ms), aceito só de itens da fila offline. Sujeito a
   * salvaguardas anti-fraude no servidor: não-futuro, mesmo dia local, e
   * posterior à última batida. Se qualquer guarda falhar, é descartado e usa-se
   * o horário do servidor (a batida não é perdida, só não confia no relógio do cliente).
   */
  ts: z.number().int().positive().optional(),
});

/**
 * Registra uma batida da jornada (entrada → N descansos → saída). Substitui os
 * antigos baterPonto/encerrarJornada — a máquina de estados (no service) decide
 * o que é válido. O acoplamento com a SessaoTrabalho (rateio) é transacional.
 */
export const registrarBatida = defineAction(
  { ...base, acao: "registrar-batida", entidade: "Batida", schema: registrarBatidaSchema },
  async (i, { user }) => {
    const agora = new Date();
    let horario = agora;
    let origem: "app" | "offline" = "app";

    if (i.ts != null) {
      origem = "offline";
      const tsDate = new Date(i.ts);
      const naoFuturo = tsDate.getTime() <= agora.getTime();
      const mesmoDia = diaLocal(tsDate) === diaLocal(agora);
      // "posterior à última batida" é reforçado pela própria máquina de estados
      // (a idempotência/estado no service rejeita replays fora de ordem).
      horario = naoFuturo && mesmoDia ? tsDate : agora;
    }

    const r = await aplicarBatida({
      userId: user.id,
      tipo: i.tipo,
      horario,
      projetoId: i.projetoId || null,
      geo: (i.geo ?? undefined) as Prisma.InputJsonValue | undefined,
      origem,
    });
    rev();
    return r;
  },
);

/**
 * Troca de projeto durante a jornada: fecha a sessão atual (contabiliza o tempo)
 * e abre nova sessão no projeto escolhido, NO MESMO INSTANTE — não cria batida e
 * não altera o total do dia, só a fatia por projeto (invariante preservada).
 */
export const trocarProjeto = defineAction(
  { ...base, acao: "trocar-projeto", entidade: "SessaoTrabalho", schema: z.object({ projetoId: projetoOpt }) },
  async (i, { user }) => {
    const aberta = await prisma.sessaoTrabalho.findFirst({ where: { userId: user.id, fim: null } });
    if (!aberta) throw new ActionError("Nenhuma jornada aberta para trocar de projeto.");
    const agora = new Date();
    await prisma.$transaction([
      prisma.sessaoTrabalho.update({ where: { id: aberta.id }, data: { fim: agora } }),
      prisma.sessaoTrabalho.create({
        data: { userId: user.id, projetoId: i.projetoId || null, inicio: agora },
      }),
    ]);
    rev();
    return { ok: true };
  },
);

/**
 * "Assinatura" do espelho de um mês encerrado pelo próprio colaborador (S2).
 * Grava um hash SHA-256 do conteúdo aceito como prova de não-repúdio (mesmo
 * padrão do AceiteTermo). Só o próprio usuário, só meses já encerrados.
 */
export const aceitarEspelhoMes = defineAction(
  {
    ...base,
    acao: "aceitar-espelho",
    entidade: "EspelhoAceite",
    schema: z.object({
      ano: z.number().int().min(2000).max(2100),
      mes: z.number().int().min(1).max(12),
    }),
  },
  async (i, { user }) => {
    const det = await espelhoDetalhado(user.id, i.ano, i.mes);
    if (!det.podeAceitar) throw new ActionError("Só é possível assinar espelhos de meses já encerrados.");

    const conteudo = JSON.stringify(
      det.dias.map((d) => ({
        d: d.dia,
        e: d.entrada,
        s: d.saida,
        t: d.trabalhadoMin,
        st: d.status,
      })),
    );
    const hash = createHash("sha256").update(conteudo).digest("hex");

    await prisma.espelhoAceite.upsert({
      where: { userId_ano_mes: { userId: user.id, ano: i.ano, mes: i.mes } },
      create: { userId: user.id, ano: i.ano, mes: i.mes, hash },
      update: { hash, aceitoEm: new Date() },
    });
    revalidatePath("/ponto/espelho");
    return { ok: true };
  },
);

const revEspelho = () => {
  revalidatePath("/ponto");
  revalidatePath("/ponto/espelho");
};

/** Edição do PRÓPRIO ponto de um dia (com justificativa) — aplicada sem ciência. */
export const ajustarPontoProprio = defineAction(
  { ...base, roles: INTERNAL_ROLES, acao: "ajustar-ponto-proprio", entidade: "AjustePonto", schema: ajustePontoProprioSchema },
  async (i, { user }) => {
    const r = await editarDia({
      userId: user.id,
      editorId: user.id,
      diaISO: i.dia,
      itens: i.itens,
      justificativa: i.justificativa,
      proprio: true,
    });
    revEspelho();
    return r;
  },
);

/**
 * Edição do ponto de OUTRO usuário (gestor). Aplica imediatamente e cria o
 * ajuste `pendente_ciencia`; notifica o colaborador para confirmar ou contestar.
 */
export const ajustarPontoEquipe = defineAction(
  { ...base, recurso: "ponto", permissao: "ajustar", acao: "ajustar-ponto-equipe", entidade: "AjustePonto", schema: ajustePontoEquipeSchema },
  async (i, { user }) => {
    if (i.userId === user.id) throw new ActionError("Use a edição do próprio ponto.");
    const r = await editarDia({
      userId: i.userId,
      editorId: user.id,
      diaISO: i.dia,
      itens: i.itens,
      justificativa: i.justificativa,
      proprio: false,
    });
    await notificar(i.userId, {
      titulo: "Seu ponto foi ajustado",
      corpo: `O registro de ${i.dia} foi ajustado por ${user.name}. Confirme a ciência ou conteste.`,
      href: "/ponto",
      tag: `ajuste-ponto-${r.ajusteId}`,
    });
    revEspelho();
    return r;
  },
);

/** Colaborador confirma ciência de um ajuste feito no seu ponto. */
export const darCienciaAjuste = defineAction(
  { ...base, roles: INTERNAL_ROLES, acao: "dar-ciencia-ajuste", entidade: "AjustePonto", schema: cienciaAjusteSchema },
  async (i, { user }) => {
    const aj = await prisma.ajustePonto.findUnique({ where: { id: i.ajusteId }, select: { userId: true, status: true } });
    if (!aj || aj.userId !== user.id) throw new ActionError("Ajuste não encontrado.");
    if (aj.status !== "pendente_ciencia") throw new ActionError("Este ajuste não está pendente de ciência.");
    await prisma.ajustePonto.update({
      where: { id: i.ajusteId },
      data: { status: "ciente", cienciaEm: new Date() },
    });
    revEspelho();
    return { ok: true };
  },
);

/** Colaborador contesta um ajuste feito no seu ponto — notifica o editor. */
export const contestarAjuste = defineAction(
  { ...base, roles: INTERNAL_ROLES, acao: "contestar-ajuste", entidade: "AjustePonto", schema: contestarAjusteSchema },
  async (i, { user }) => {
    const aj = await prisma.ajustePonto.findUnique({
      where: { id: i.ajusteId },
      select: { userId: true, status: true, editorId: true, dia: true },
    });
    if (!aj || aj.userId !== user.id) throw new ActionError("Ajuste não encontrado.");
    if (aj.status !== "pendente_ciencia") throw new ActionError("Este ajuste não está pendente de ciência.");
    await prisma.ajustePonto.update({
      where: { id: i.ajusteId },
      data: { status: "contestado", contestacaoMotivo: i.motivo, cienciaEm: new Date() },
    });
    await notificar(aj.editorId, {
      titulo: "Ajuste de ponto contestado",
      corpo: `${user.name} contestou o ajuste de ${diaLocal(aj.dia)}: ${i.motivo}`,
      href: "/ponto/espelho",
      tag: `contestacao-${i.ajusteId}`,
    });
    revEspelho();
    return { ok: true };
  },
);
