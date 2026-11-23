import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaDeSaoPaulo } from "@/lib/data";
import { podeVerConversaDoProjeto } from "@/modules/portal/mensagens/service";
import {
  MOTIVO_AGENDA_NAO_ENCONTRADA,
  MOTIVO_MARCO_ENTREGUE,
  MOTIVO_NOTA_LONGA,
  MOTIVO_NOTA_VAZIA,
  MOTIVO_SEM_NOTA,
  NOTA_MAX,
  marcosDaAgenda,
  type MarcoDaAgenda,
} from "./marcos";
import { carregarEntradaDaAgenda } from "./queries";
import {
  MOTIVO_CANCELAR_MAX,
  MOTIVO_REUNIAO_MUDOU,
  motivoParaNaoEditar,
  mudouDiaOuHora,
  validarReuniao,
  type CamposReuniao,
} from "./reunioes";

/**
 * Único escritor da agenda do portal (spec docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md). A porta da
 * EQUIPE é a audiência da conversa (`podeVerConversaDoProjeto`); fora dela, ou marco que a agenda não mostra:
 * "Agenda não encontrada.".
 */

const naoEncontrada = () => new ActionError(MOTIVO_AGENDA_NAO_ENCONTRADA);

/** O marco tem de estar entre os que a agenda mostra deste projeto: nada de escrever nota em marco de outro lugar. */
async function exigirMarco(p: { projetoId: string; marcoId: string; userId: string }): Promise<MarcoDaAgenda> {
  if (!(await podeVerConversaDoProjeto(p.userId, p.projetoId))) throw naoEncontrada();
  const entrada = await carregarEntradaDaAgenda(p.projetoId);
  const marco = entrada ? marcosDaAgenda(entrada).find((m) => m.marcoId === p.marcoId) : undefined;
  if (!marco) throw naoEncontrada();
  if (marco.situacao === "entregue") throw new ActionError(MOTIVO_MARCO_ENTREGUE);
  return marco;
}

// ── Nota de motivo ─────────────────────────────────────────────────────────────────────────

export async function salvarNota(p: { projetoId: string; marcoId: string; nota: string; userId: string }): Promise<void> {
  await exigirMarco(p);
  const nota = p.nota.trim();
  if (nota === "") throw new ActionError(MOTIVO_NOTA_VAZIA);
  if (nota.length > NOTA_MAX) throw new ActionError(MOTIVO_NOTA_LONGA);
  const dados = { nota, notaPorId: p.userId, notaEm: new Date() };
  try {
    await prisma.marcoAgendaPortal.upsert({
      where: { marcoId: p.marcoId },
      create: { projetoId: p.projetoId, marcoId: p.marcoId, ...dados },
      update: dados,
    });
  } catch (e) {
    // Duas pessoas criando a linha do mesmo marco ao mesmo tempo: a segunda só atualiza.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    await prisma.marcoAgendaPortal.update({ where: { marcoId: p.marcoId }, data: dados });
  }
}

export async function removerNota(p: { projetoId: string; marcoId: string; userId: string }): Promise<void> {
  await exigirMarco(p);
  const r = await prisma.marcoAgendaPortal.updateMany({
    where: { marcoId: p.marcoId, projetoId: p.projetoId, nota: { not: null } },
    data: { nota: null, notaPorId: null, notaEm: null },
  });
  if (r.count !== 1) throw new ActionError(MOTIVO_SEM_NOTA);
}

// ── Reuniões agendadas ─────────────────────────────────────────────────────────────────────

const dataDoBanco = (d: string) => new Date(`${d}T00:00:00.000Z`);
const diaIso = (d: Date) => d.toISOString().slice(0, 10);

/** A reunião, lida para decidir; a equipe só enxerga as dos projetos de que é audiência. */
async function reuniaoParaMudar(id: string, userId: string) {
  const r = await prisma.reuniaoAgendada.findUnique({
    where: { id },
    select: { id: true, projetoId: true, estado: true, dia: true, horaInicio: true, diaAnterior: true, horaAnterior: true, updatedAt: true },
  });
  if (!r || !(await podeVerConversaDoProjeto(userId, r.projetoId))) throw naoEncontrada();
  return r;
}

const estadoDe = (r: { estado: "agendada" | "cancelada"; dia: Date; diaAnterior: Date | null; horaAnterior: string | null }) => ({
  estado: r.estado,
  dia: diaIso(r.dia),
  diaAnterior: r.diaAnterior ? diaIso(r.diaAnterior) : null,
  horaAnterior: r.horaAnterior,
});

export async function agendarReuniao(p: CamposReuniao & { projetoId: string; userId: string }): Promise<{ id: string }> {
  if (!(await podeVerConversaDoProjeto(p.userId, p.projetoId))) throw naoEncontrada();
  const v = validarReuniao(p, diaDeSaoPaulo());
  if (!v.ok) throw new ActionError(v.erro);
  const c = v.valor;
  const r = await prisma.reuniaoAgendada.create({
    data: {
      projetoId: p.projetoId,
      titulo: c.titulo,
      dia: dataDoBanco(c.dia),
      horaInicio: c.horaInicio,
      duracaoMinutos: c.duracaoMinutos,
      link: c.link,
      local: c.local,
      pauta: c.pauta,
      criadaPorId: p.userId,
    },
    select: { id: true },
  });
  return r;
}

/**
 * Editar ou remarcar. Mudar dia ou hora guarda os anteriores (só a última troca) e marca a mudança para o aviso; mudar só
 * link, local, pauta ou título não remarca. A escrita é condicionada ao `updatedAt` lido: duas pessoas editando ao mesmo
 * tempo, uma vence e a outra recebe `MOTIVO_REUNIAO_MUDOU`.
 */
export async function editarReuniao(p: CamposReuniao & { id: string; userId: string }): Promise<{ projetoId: string }> {
  const r = await reuniaoParaMudar(p.id, p.userId);
  const hoje = diaDeSaoPaulo();
  const recusa = motivoParaNaoEditar(estadoDe(r), hoje);
  if (recusa) throw new ActionError(recusa);
  const v = validarReuniao(p, hoje);
  if (!v.ok) throw new ActionError(v.erro);
  const c = v.valor;
  const remarcou = mudouDiaOuHora({ dia: diaIso(r.dia), horaInicio: r.horaInicio }, { dia: c.dia, horaInicio: c.horaInicio });
  const gravou = await prisma.reuniaoAgendada.updateMany({
    where: { id: r.id, estado: "agendada", updatedAt: r.updatedAt },
    data: {
      titulo: c.titulo,
      dia: dataDoBanco(c.dia),
      horaInicio: c.horaInicio,
      duracaoMinutos: c.duracaoMinutos,
      link: c.link,
      local: c.local,
      pauta: c.pauta,
      ...(remarcou ? { diaAnterior: r.dia, horaAnterior: r.horaInicio, mudancaEm: dataDoBanco(hoje), mudancaTipo: "remarcada" as const } : {}),
    },
  });
  if (gravou.count !== 1) throw new ActionError(MOTIVO_REUNIAO_MUDOU);
  return { projetoId: r.projetoId };
}

/** Cancelar é final (agende outra). O motivo é opcional e o cliente o lê. */
export async function cancelarReuniao(p: { id: string; motivo: string | null; userId: string }): Promise<{ projetoId: string }> {
  const r = await reuniaoParaMudar(p.id, p.userId);
  const hoje = diaDeSaoPaulo();
  const recusa = motivoParaNaoEditar(estadoDe(r), hoje);
  if (recusa) throw new ActionError(recusa);
  const motivo = (p.motivo ?? "").trim();
  if (motivo.length > MOTIVO_CANCELAR_MAX) throw new ActionError(`O motivo passa de ${MOTIVO_CANCELAR_MAX} caracteres.`);
  const gravou = await prisma.reuniaoAgendada.updateMany({
    where: { id: r.id, estado: "agendada", updatedAt: r.updatedAt },
    data: { estado: "cancelada", canceladaEm: new Date(), motivoCancelamento: motivo || null, mudancaEm: dataDoBanco(hoje), mudancaTipo: "cancelada" },
  });
  if (gravou.count !== 1) throw new ActionError(MOTIVO_REUNIAO_MUDOU);
  return { projetoId: r.projetoId };
}

export async function projetoDaReuniaoAgendada(id: string): Promise<string | null> {
  const r = await prisma.reuniaoAgendada.findUnique({ where: { id }, select: { projetoId: true } });
  return r?.projetoId ?? null;
}
