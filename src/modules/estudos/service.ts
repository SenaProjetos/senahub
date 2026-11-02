import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { SessionUser } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import { projetoVisivel } from "@/modules/planejamento/queries";

import { MOTIVO_ALTERADO_POR_OUTRA_PESSOA, MOTIVO_SEM_EDICAO } from "./acesso";
import { conteudoVazio, MAX_ESTUDOS_POR_PROJETO, TIPO_ESTUDO_CARGAS, type ConteudoEstudo } from "./conteudo";
import { liberacaoDosEstudos, podeEditarEstudosDoProjeto } from "./queries";

/**
 * Regras de negócio do Estudos, compartilhadas pelas actions (sem Next/HTTP). Toda escrita passa por
 * `exigirAcesso`: motor liberado → projeto visível → (escrita) responsável de disciplina ou quem atua
 * em disciplina alheia.
 */

export const MOTIVO_NAO_LIBERADO = "Os estudos ainda não foram liberados: o motor de cálculo está em validação.";
export const MOTIVO_PROJETO_INEXISTENTE = "Projeto não encontrado.";
export const MOTIVO_ESTUDO_INEXISTENTE = "Estudo não encontrado.";
export const MOTIVO_LIMITE_DE_ESTUDOS = `O projeto já tem o máximo de ${MAX_ESTUDOS_POR_PROJETO} estudos.`;

export async function exigirAcesso(user: SessionUser, projetoId: string, escrita: boolean): Promise<void> {
  const { liberado } = await liberacaoDosEstudos(user);
  if (!liberado) throw new ActionError(MOTIVO_NAO_LIBERADO);
  const projeto = await projetoVisivel(user, projetoId);
  if (!projeto) throw new ActionError(MOTIVO_PROJETO_INEXISTENTE);
  if (escrita && !(await podeEditarEstudosDoProjeto(user, projetoId))) throw new ActionError(MOTIVO_SEM_EDICAO);
}

async function estudoOuErro(id: string) {
  const e = await prisma.estudoProjeto.findUnique({ where: { id }, select: { id: true, projetoId: true, nome: true, conteudo: true } });
  if (!e) throw new ActionError(MOTIVO_ESTUDO_INEXISTENTE);
  return e;
}

async function exigirEspaco(projetoId: string) {
  const total = await prisma.estudoProjeto.count({ where: { projetoId } });
  if (total >= MAX_ESTUDOS_POR_PROJETO) throw new ActionError(MOTIVO_LIMITE_DE_ESTUDOS);
}

const comoJson = (c: ConteudoEstudo) => c as unknown as Prisma.InputJsonValue;

export async function criarEstudo(user: SessionUser, i: { projetoId: string; nome: string }) {
  await exigirAcesso(user, i.projetoId, true);
  await exigirEspaco(i.projetoId);
  const e = await prisma.estudoProjeto.create({
    data: {
      projetoId: i.projetoId,
      tipo: TIPO_ESTUDO_CARGAS,
      nome: i.nome,
      conteudo: comoJson(conteudoVazio()),
      criadoPorId: user.id,
      atualizadoPorId: user.id,
    },
    select: { id: true },
  });
  return { id: e.id, projetoId: i.projetoId };
}

/** Grava o estudo inteiro. `updateMany` condicionado à versão lida: 0 linhas = outra pessoa gravou antes. */
export async function salvarEstudo(user: SessionUser, i: { id: string; versao: number; nome: string; conteudo: ConteudoEstudo }) {
  const atual = await estudoOuErro(i.id);
  await exigirAcesso(user, atual.projetoId, true);
  const r = await prisma.estudoProjeto.updateMany({
    where: { id: i.id, versao: i.versao },
    data: { nome: i.nome, conteudo: comoJson(i.conteudo), versao: { increment: 1 }, atualizadoPorId: user.id },
  });
  if (r.count !== 1) {
    // Outra pessoa gravou antes — ou o estudo foi excluído no meio: a mensagem tem de dizer qual.
    const aindaExiste = await prisma.estudoProjeto.count({ where: { id: i.id } });
    throw new ActionError(aindaExiste ? MOTIVO_ALTERADO_POR_OUTRA_PESSOA : MOTIVO_ESTUDO_INEXISTENTE);
  }
  return { id: i.id, projetoId: atual.projetoId, versao: i.versao + 1 };
}

export async function duplicarEstudo(user: SessionUser, i: { id: string }) {
  const atual = await estudoOuErro(i.id);
  await exigirAcesso(user, atual.projetoId, true);
  await exigirEspaco(atual.projetoId);
  const copia = await prisma.estudoProjeto.create({
    data: {
      projetoId: atual.projetoId,
      tipo: TIPO_ESTUDO_CARGAS,
      nome: `${atual.nome.slice(0, 112)} (cópia)`,
      conteudo: atual.conteudo as Prisma.InputJsonValue,
      criadoPorId: user.id,
      atualizadoPorId: user.id,
    },
    select: { id: true },
  });
  return { id: copia.id, projetoId: atual.projetoId };
}

export async function excluirEstudo(user: SessionUser, i: { id: string }) {
  const atual = await estudoOuErro(i.id);
  await exigirAcesso(user, atual.projetoId, true);
  const r = await prisma.estudoProjeto.deleteMany({ where: { id: i.id } });
  if (r.count !== 1) throw new ActionError(MOTIVO_ESTUDO_INEXISTENTE);
  return { id: i.id, projetoId: atual.projetoId };
}
