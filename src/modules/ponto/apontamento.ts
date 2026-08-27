import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { minutosSessao } from "@/modules/ponto/format";
import { normalizarAlocacaoPonto, type TipoAlocacaoPonto } from "@/modules/ponto/alocacao";

/**
 * Apontamento de horas — jornada aberta/fechada em `SessaoTrabalho`, SEM o vocabulário de
 * ponto (entrada/descanso/saída), SEM `Batida`, SEM geolocalização, SEM máquina de estados.
 *
 * Existe porque `aplicarBatida` (`modules/ponto/service.ts`) é hoje o ÚNICO ponto de escrita
 * de `SessaoTrabalho` no sistema — verificado nesta onda (grep em todo `src/modules`). Isso
 * significa que PJ/freelancer, para alimentar o próprio rateio de horas, não tinham outro
 * caminho a não ser passar pela máquina de estados do PONTO — com geolocalização, tolerância
 * de atraso (art. 58 §1º CLT) e o `EspelhoAceite` assinado (bloqueado para eles desde o P1,
 * mas a batida em si seguia aberta). Isso é o "conjunto probatório de pejotização" que o
 * conselho identificou: geo + tolerância + banco de horas + jornada controlada, tudo junto,
 * para quem não deveria ter subordinação nenhuma.
 *
 * `SessaoTrabalho` é reaproveitada tal como está — `rateio/queries.ts` já soma minutos dessa
 * tabela de forma genérica (`minutosSessao`, sem depender de `Batida`), então o rateio do PJ
 * continua idêntico independente de a sessão ter vindo daqui ou de `aplicarBatida`.
 *
 * `aplicarBatida`/`registrarBatida` continuam INTOCADOS e abertos aos mesmos roles de hoje —
 * este módulo é ADITIVO. A restrição de `registrarBatida` a quem controla jornada (retirando
 * PJ/freelancer de vez) é um corte de comportamento real, que o conselho condicionou a um
 * ciclo de fechamento em sombra antes de acontecer — deliberadamente NÃO feito aqui.
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§8, Onda B; §13.5)
 */

export type ApontamentoAtual = {
  aberto: {
    id: string;
    projetoId: string | null;
    tipoAlocacao: TipoAlocacaoPonto;
    inicio: Date;
    projeto: { codigo: string; nome: string } | null;
  } | null;
  hojeMin: number;
};

export async function apontamentoAtual(userId: string): Promise<ApontamentoAtual> {
  const aberto = await prisma.sessaoTrabalho.findFirst({
    where: { userId, fim: null },
    orderBy: { inicio: "desc" },
    select: {
      id: true,
      projetoId: true,
      tipoAlocacao: true,
      inicio: true,
      projeto: { select: { codigo: true, nome: true } },
    },
  });

  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  const sessoesHoje = await prisma.sessaoTrabalho.findMany({
    where: { userId, inicio: { gte: inicioDia } },
    select: { inicio: true, fim: true },
  });
  const hojeMin = sessoesHoje.reduce((acc, s) => acc + minutosSessao(s.inicio, s.fim), 0);

  return { aberto, hojeMin };
}

export async function abrirApontamento(userId: string, projetoId: string | null) {
  const aberto = await prisma.sessaoTrabalho.findFirst({ where: { userId, fim: null } });
  if (aberto) throw new ActionError("Já existe um apontamento em aberto — encerre antes de iniciar outro.");
  return prisma.sessaoTrabalho.create({
    data: { userId, ...normalizarAlocacaoPonto(projetoId), inicio: new Date() },
  });
}

/** Troca de projeto SEM perder o tempo: fecha a sessão atual e abre outra no mesmo instante. */
export async function trocarApontamento(userId: string, projetoId: string | null) {
  const aberto = await prisma.sessaoTrabalho.findFirst({ where: { userId, fim: null } });
  if (!aberto) throw new ActionError("Nenhum apontamento em aberto para trocar de projeto.");
  const agora = new Date();
  const alocacao = normalizarAlocacaoPonto(projetoId);
  await prisma.$transaction([
    prisma.sessaoTrabalho.update({ where: { id: aberto.id }, data: { fim: agora } }),
    prisma.sessaoTrabalho.create({ data: { userId, ...alocacao, inicio: agora } }),
  ]);
}

export async function fecharApontamento(userId: string) {
  const aberto = await prisma.sessaoTrabalho.findFirst({ where: { userId, fim: null } });
  if (!aberto) throw new ActionError("Nenhum apontamento em aberto.");
  await prisma.sessaoTrabalho.update({ where: { id: aberto.id }, data: { fim: new Date() } });
}
