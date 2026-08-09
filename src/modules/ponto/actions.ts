"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { INTERNAL_ROLES, CLT_ROLES, PJ_ROLES } from "@/lib/roles";
import { notificar } from "@/lib/notificar";
import { getSession } from "@/lib/session";
import { aplicarBatida, editarDia } from "@/modules/ponto/service";
import { apontamentoAtual } from "@/modules/ponto/apontamento";
import {
  espelhoDetalhado,
  projetosDoUsuario,
  resumoJornada,
  type ResumoHeader,
} from "@/modules/ponto/queries";
import { diaLocal } from "@/modules/ponto/engine";
import {
  ajustePontoProprioSchema,
  ajustePontoEquipeSchema,
  cienciaAjusteSchema,
  contestarAjusteSchema,
} from "@/modules/ponto/schemas";
import type { Prisma } from "@/generated/prisma/client";

/**
 * `roles` é obrigatório aqui: sem `roles` E sem `recurso`, `defineAction` pula o gate inteiro
 * (`lib/with-action.ts`) e sobra só sessão + `ativo`. Como Server Action é endpoint, o perfil
 * `cliente` (usuário externo do portal) alcançava as ações de ponto.
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§4c)
 */
const base = { modulo: "rh", roles: INTERNAL_ROLES } as const;
const rev = () => revalidatePath("/ponto");

/**
 * Resumo da jornada corrente para a miniatura do header (lida em polling, não é mutação →
 * fora do `defineAction`, como `buscarAgendaHoje`). O gate de role é explícito: Server Action
 * é endpoint público, e `cliente` não pode ler estado de jornada de ninguém.
 * PJ/freelancer recebem o APONTAMENTO (sem vocabulário de ponto) — ver `apontamento.ts`.
 */
export async function buscarResumoJornada(): Promise<ResumoHeader | null> {
  const session = await getSession();
  const user = session?.user;
  if (!user || !user.ativo || !INTERNAL_ROLES.includes(user.role)) return null;

  if (PJ_ROLES.includes(user.role)) {
    const { aberto, hojeMin } = await apontamentoAtual(user.id);
    return {
      modo: "apontamento" as const,
      aberto: aberto
        ? { inicio: aberto.inicio, projetoId: aberto.projetoId, projeto: aberto.projeto }
        : null,
      hojeMin,
      agora: new Date(),
    };
  }

  return { modo: "ponto" as const, ...(await resumoJornada(user.id)) };
}

/** Projetos do seletor da miniatura do header — mesmo gate/leitura do seletor da tela `/ponto`. */
export async function buscarProjetosPonto() {
  const session = await getSession();
  const user = session?.user;
  if (!user || !user.ativo || !INTERNAL_ROLES.includes(user.role)) return [];
  return projetosDoUsuario(user.id);
}

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
/**
 * Bater ponto é ato de quem tem JORNADA CONTROLADA — CLT e estágio. PJ, freelancer e sócio
 * lançam horas por `modules/ponto/apontamento.ts`, que grava `SessaoTrabalho` direto, sem
 * `Batida`, sem geolocalização e sem máquina de estados de jornada.
 *
 * O gate ficou aberto de propósito até aqui (§10 do plano): `Batida` e `SessaoTrabalho` eram
 * gravadas 1:1, e cortar a batida antes de existir o apontamento cegaria a margem de projeto no
 * mês seguinte. A separação foi feita na Onda B (§13.5), que deixou o PJ **sem o botão** mas com
 * o servidor ainda aceitando os dois caminhos — "corte real fica pro ciclo em sombra". O ciclo
 * foi dado por cumprido em 2026-08-08 (§15), então o corte é agora.
 *
 * Por que isso importa além da arrumação: `Batida` com geolocalização, tolerância de atraso e
 * banco de horas é o conjunto probatório de vínculo empregatício. Aceitá-la de um PJ é produzir,
 * em banco estruturado e exportável, prova contra a própria empresa (§4, bug (c)).
 */
export const registrarBatida = defineAction(
  { ...base, roles: CLT_ROLES, acao: "registrar-batida", entidade: "Batida", schema: registrarBatidaSchema },
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
 *
 * Restrito a quem controla jornada (`CLT_ROLES`): o espelho assinado é prova de controle de
 * jornada, e produzi-lo para PJ/freelancer/sócio materializa subordinação. A batida em si segue
 * liberada aos internos porque `Batida` e `SessaoTrabalho` são gravadas 1:1 e o apontamento do PJ
 * alimenta o rateio — desacoplar os dois é a Onda B do plano (§8).
 */
export const aceitarEspelhoMes = defineAction(
  {
    ...base,
    roles: CLT_ROLES,
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
