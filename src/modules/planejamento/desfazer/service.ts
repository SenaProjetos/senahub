import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { exigirPlanoEditavel } from "../trava-plano-service";
import { MOTIVO_PLANO_TRAVADO, planoTravado } from "../trava-plano";
import {
  impressaoDoPlano,
  planoDeRestauracao,
  type AtribuicaoFoto,
  type DependenciaFoto,
  type EstadoPlano,
  type LinhaFoto,
  type ProgressoFoto,
} from "./estado";

/**
 * Desfazer da EAP (Ctrl+Z), o lado com I/O de `estado.ts`. Cada mutação do plano roda dentro de `comPasso`: lê a foto
 * do plano inteiro antes, executa, e — se o plano mudou de fato — grava um passo (foto de antes + impressão de
 * depois). `desfazerUltimoPasso` só aplica se o plano de hoje ainda tem a impressão do passo.
 */
type Db = Prisma.TransactionClient | typeof prisma;

/** Passos guardados por pessoa e por projeto. */
export const MAX_PASSOS = 20;

const DATAS_DA_LINHA = ["inicioPrevisto", "fimPrevisto", "inicioReal", "fimReal", "inicioBaseline", "fimBaseline", "restricaoData", "previsaoDesbloqueio", "createdAt", "updatedAt"];

export const MOTIVO_NADA_A_DESFAZER = "Não há nada para desfazer.";
export const MOTIVO_PLANO_MUDOU =
  "O plano mudou depois dessa ação (por outra pessoa ou por outra tela). Não dá para desfazer sem sobrescrever essa mudança.";

/** A foto do plano: o que o desfazer guarda e compara. */
export async function lerEstadoDoPlano(db: Db, projetoId: string): Promise<EstadoPlano> {
  const cronograma = await db.cronogramaProjeto.findUnique({ where: { projetoId }, select: { inicioProjeto: true } });
  const linhas = await db.eapTarefa.findMany({ where: { projetoId }, orderBy: { ordem: "asc" } });
  const ids = linhas.map((l) => l.id);
  const dependencias = await db.eapDependencia.findMany({ where: { tarefaId: { in: ids } } });
  const atribuicoes = await db.eapAtribuicao.findMany({ where: { tarefaId: { in: ids } } });
  const parcelas = await db.contratoParcelaEntrega.findMany({ where: { marcoId: { in: ids } }, select: { id: true, marcoId: true } });
  const baselineLinhas = await db.eapBaselineLinha.findMany({ where: { tarefaId: { in: ids } }, select: { id: true, tarefaId: true } });
  const progressos = await db.eapProgressoRegistro.findMany({ where: { tarefaId: { in: ids } } });
  return {
    inicioProjeto: cronograma?.inicioProjeto ? cronograma.inicioProjeto.toISOString().slice(0, 10) : null,
    // JSON ida e volta: data vira ISO e Decimal vira texto — o formato que o passo guarda.
    linhas: JSON.parse(JSON.stringify(linhas)) as LinhaFoto[],
    dependencias: dependencias.map((d): DependenciaFoto => ({ id: d.id, tarefaId: d.tarefaId, predecessoraId: d.predecessoraId, tipo: d.tipo, lagDias: d.lagDias.toString() })),
    atribuicoes: atribuicoes.map((a): AtribuicaoFoto => ({ id: a.id, tarefaId: a.tarefaId, userId: a.userId, papel: a.papel, horasPrevistas: a.horasPrevistas.toString(), principal: a.principal })),
    parcelas,
    baselineLinhas,
    // O histórico de % cai em cascade com a linha: vai na foto para voltar com ela (o Valor Agregado de uma Data de
    // Status passada o lê). O histórico de CÓDIGO da EAP não vai: cresce a cada mudança de posição e não alimenta nada.
    progressos: JSON.parse(JSON.stringify(progressos)) as ProgressoFoto[],
  };
}

/** A foto lida numa transação de leitura repetível: as leituras separadas enxergam o mesmo instante do banco. */
const fotoConsistente = (projetoId: string) =>
  prisma.$transaction((tx) => lerEstadoDoPlano(tx, projetoId), { isolationLevel: "RepeatableRead", timeout: 30_000 });

/**
 * Roda `fn` (a mutação) e guarda o passo de desfazer se o plano mudou. Se `fn` lança, relança sem passo. Falha ao
 * LER ou GRAVAR o passo nunca derruba a ação: ela já aconteceu — loga e segue (sem desfazer para essa ação).
 */
export async function comPasso<R>(p: { projetoId: string; userId: string; rotulo: string }, fn: () => Promise<R>): Promise<R> {
  let antes: EstadoPlano | null = null;
  try {
    // Plano aprovado e fechado: o desfazer não vale lá (o plano está travado), então nem se guarda passo — pessoas e
    // horas seguem editáveis depois da aprovação e acumulariam passos que ninguém poderia desfazer.
    const cronograma = await prisma.cronogramaProjeto.findUnique({ where: { projetoId: p.projetoId }, select: { aprovado: true, emRevisao: true } });
    if (!planoTravado(cronograma)) antes = await fotoConsistente(p.projetoId);
  } catch (e) {
    console.error("[desfazer] falha ao ler o plano antes da ação:", e);
  }
  const resultado = await fn();
  if (!antes) return resultado;
  try {
    const impressaoAntes = impressaoDoPlano(antes);
    const depoisImpressao = impressaoDoPlano(await fotoConsistente(p.projetoId));
    if (depoisImpressao === impressaoAntes) return resultado;
    await prisma.eapPassoDesfazer.create({
      data: { projetoId: p.projetoId, userId: p.userId, rotulo: p.rotulo.slice(0, 200), antes: antes as unknown as Prisma.InputJsonValue, depoisImpressao },
    });
    const velhos = await prisma.eapPassoDesfazer.findMany({
      where: { projetoId: p.projetoId, userId: p.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: MAX_PASSOS,
      select: { id: true },
    });
    if (velhos.length > 0) await prisma.eapPassoDesfazer.deleteMany({ where: { id: { in: velhos.map((v) => v.id) } } });
  } catch (e) {
    console.error("[desfazer] falha ao gravar o passo:", e);
  }
  return resultado;
}

const dataDoBanco = (v: unknown): unknown => (typeof v === "string" ? new Date(v) : v);
const ultimoPasso = (projetoId: string, userId: string) =>
  prisma.eapPassoDesfazer.findFirst({ where: { projetoId, userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });

/** O rótulo do que o Ctrl+Z desfaria agora (`null` = nada). */
export async function rotuloDoUltimoPasso(projetoId: string, userId: string): Promise<string | null> {
  return (await ultimoPasso(projetoId, userId))?.rotulo ?? null;
}

/** A pilha do projeto some ao aprovar o cronograma e ao fechar a revisão com nova linha de base. */
export async function limparPassos(projetoId: string): Promise<void> {
  await prisma.eapPassoDesfazer.deleteMany({ where: { projetoId } });
}

/**
 * Restaura o plano para a foto do último passo da pessoa. Recusa com o plano travado, sem passo, ou se o plano de hoje
 * não é o que o passo deixou — e nesse caso descarta a pilha (todo passo anterior ficou para trás da edição alheia).
 *
 * Tudo dentro de UMA transação com um lock consultivo do projeto: ler o passo, conferir a impressão e restaurar não
 * podem ser separados (dois Ctrl+Z de duas abas, ou uma edição entre a conferência e a escrita, passariam pela conferência
 * e sobrescreveriam). O lock serializa os desfazeres; não impede uma ação comum — para essa vale a impressão.
 * Erro inesperado na restauração (uma disciplina que saiu do projeto, por exemplo) descarta a pilha com uma frase clara:
 * o rollback desfaz também a reserva do passo, e o passo preso no topo travaria todo Ctrl+Z seguinte.
 */
export async function desfazerUltimoPasso(projetoId: string, userId: string): Promise<{ rotulo: string }> {
  const cronograma = await prisma.cronogramaProjeto.findUnique({ where: { projetoId }, select: { aprovado: true, emRevisao: true } });
  if (planoTravado(cronograma)) throw new ActionError(MOTIVO_PLANO_TRAVADO);

  type Resultado = { ok: true; rotulo: string } | { ok: false; motivo: string };
  let resultado: Resultado;
  try {
    resultado = await prisma.$transaction(
      async (tx): Promise<Resultado> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`eap-desfazer:${projetoId}`}))`;
        const passo = await tx.eapPassoDesfazer.findFirst({ where: { projetoId, userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        if (!passo) return { ok: false, motivo: MOTIVO_NADA_A_DESFAZER };
        const antes = passo.antes as unknown as EstadoPlano;
        const atual = await lerEstadoDoPlano(tx, projetoId);
        if (impressaoDoPlano(atual) !== passo.depoisImpressao) {
          await tx.eapPassoDesfazer.deleteMany({ where: { projetoId, userId } });
          return { ok: false, motivo: MOTIVO_PLANO_MUDOU };
        }
        // Em revisão, marca o plano como alterado (e recusa se travou entre a leitura de cima e aqui): só quando vai gravar.
        await exigirPlanoEditavel(projetoId);
        await restaurar(tx, projetoId, planoDeRestauracao(atual, antes));
        await tx.eapPassoDesfazer.delete({ where: { id: passo.id } });
        return { ok: true, rotulo: passo.rotulo };
      },
      // Uma EAP de centenas de linhas são centenas de escritas em sequência: o padrão de 5 s não basta.
      { timeout: 60_000, maxWait: 30_000 },
    );
  } catch (e) {
    if (e instanceof ActionError) throw e;
    console.error("[desfazer] falha ao restaurar:", e);
    await prisma.eapPassoDesfazer.deleteMany({ where: { projetoId, userId } });
    throw new ActionError(
      "Não foi possível desfazer: a EAP mudou de um jeito que esse passo não alcança (por exemplo, uma disciplina foi removida). A lista de passos foi descartada.",
    );
  }
  if (!resultado.ok) throw new ActionError(resultado.motivo);
  return { rotulo: resultado.rotulo };
}

/** Aplica o plano de restauração. Ordem: início → linhas (criar, atualizar, apagar) → vínculos → pessoas → ganchos. */
async function restaurar(tx: Prisma.TransactionClient, projetoId: string, plano: ReturnType<typeof planoDeRestauracao>): Promise<void> {
  if (plano.inicioProjeto) {
    const inicio = plano.inicioProjeto.para ? new Date(`${plano.inicioProjeto.para}T00:00:00.000Z`) : null;
    await tx.cronogramaProjeto.updateMany({ where: { projetoId }, data: { inicioProjeto: inicio } });
  }
  // Linhas: criar (pais primeiro) → atualizar (reparenta quem estava sob uma linha que vai sair) → apagar.
  for (const l of plano.criarLinhas) {
    const dados = Object.fromEntries(Object.entries(l).map(([k, v]) => [k, DATAS_DA_LINHA.includes(k) ? dataDoBanco(v) : v]));
    await tx.eapTarefa.create({ data: dados as Prisma.EapTarefaUncheckedCreateInput });
  }
  for (const r of plano.criarProgressos) {
    await tx.eapProgressoRegistro.create({
      data: {
        id: r.id,
        tarefaId: r.tarefaId,
        progresso: r.progresso,
        anterior: r.anterior,
        em: new Date(r.em),
        dataStatusVigente: r.dataStatusVigente ? new Date(r.dataStatusVigente) : null,
        origem: r.origem as never,
        autorId: r.autorId,
      },
    });
  }
  for (const u of plano.atualizarLinhas) {
    const campos = Object.fromEntries(Object.entries(u.campos).map(([k, v]) => [k, DATAS_DA_LINHA.includes(k) ? dataDoBanco(v) : v]));
    await tx.eapTarefa.update({ where: { id: u.id }, data: campos as Prisma.EapTarefaUncheckedUpdateInput });
  }
  if (plano.apagarLinhas.length > 0) await tx.eapTarefa.deleteMany({ where: { id: { in: plano.apagarLinhas } } });

  // Vínculos: apagar → atualizar → criar (a chave única é tarefa + predecessora).
  if (plano.apagarDependencias.length > 0) await tx.eapDependencia.deleteMany({ where: { id: { in: plano.apagarDependencias } } });
  for (const u of plano.atualizarDependencias) await tx.eapDependencia.update({ where: { id: u.id }, data: { tipo: u.tipo as never, lagDias: u.lagDias } });
  for (const d of plano.criarDependencias) {
    await tx.eapDependencia.create({ data: { id: d.id, tarefaId: d.tarefaId, predecessoraId: d.predecessoraId, tipo: d.tipo as never, lagDias: d.lagDias } });
  }

  // Pessoas: apagar → atualizar (principal=false primeiro: o índice parcial só admite um por linha) → criar.
  if (plano.apagarAtribuicoes.length > 0) await tx.eapAtribuicao.deleteMany({ where: { id: { in: plano.apagarAtribuicoes } } });
  const atualizacoes = [...plano.atualizarAtribuicoes].sort((a, b) => Number(a.campos.principal === true) - Number(b.campos.principal === true));
  for (const u of atualizacoes) await tx.eapAtribuicao.update({ where: { id: u.id }, data: u.campos as Prisma.EapAtribuicaoUncheckedUpdateInput });
  const criacoes = [...plano.criarAtribuicoes].sort((a, b) => Number(a.principal) - Number(b.principal));
  for (const a of criacoes) {
    await tx.eapAtribuicao.create({ data: { id: a.id, tarefaId: a.tarefaId, userId: a.userId, papel: a.papel as never, horasPrevistas: a.horasPrevistas, principal: a.principal } });
  }

  // `updateMany` com `null`: só religa o que continua solto, e não falha se o contrato foi apagado.
  for (const r of plano.religarParcelas) await tx.contratoParcelaEntrega.updateMany({ where: { id: r.id, marcoId: null }, data: { marcoId: r.marcoId } });
  for (const r of plano.religarBaselineLinhas) await tx.eapBaselineLinha.updateMany({ where: { id: r.id, tarefaId: null }, data: { tarefaId: r.tarefaId } });
}

/** `limparPassos` para depois de uma ação que já aconteceu: falha ao limpar nunca vira erro da ação. */
export async function descartarPassos(projetoId: string): Promise<void> {
  await limparPassos(projetoId).catch((e) => console.error("[desfazer] falha ao descartar os passos:", e));
}
