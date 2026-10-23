import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import {
  planoDeAvanco,
  planoDeInsercaoAcima,
  planoDeMoverNoNivel,
  planoDeMovimento,
  planoDeRecuo,
  type Movimento,
  type Posicao,
} from "./arvore-eap";
import { disciplinaParaLinhaNova } from "./disciplina-linha";
import { faseDaLinhaNova } from "./disciplina-linha-service";
import { reservarIdsParaLinhas } from "./id-corporativo";
import { herdarResponsaveisNoProjeto } from "./recursos-service";

/**
 * Recuar, avançar, inserir e mover na árvore da EAP (I/O) — as decisões estão em `arvore-eap.ts`. Cada função devolve o
 * projeto: quem chama reagenda UMA vez (o motor recalcula datas, códigos da EAP e o agrupamento que mudou).
 * Separadas da action para o smoke alcançar a regra sem sessão.
 */

export type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Roda `fn` numa transação. Com `db` de transação (o lote), segue nela em vez de abrir outra: o lote é UMA transação,
 * e `carregar` das linhas seguintes enxerga o que as anteriores já gravaram.
 */
const emTransacao = <T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
  db === prisma ? prisma.$transaction(fn) : fn(db as Prisma.TransactionClient);

async function carregar(id: string, db: Db = prisma) {
  const t = await db.eapTarefa.findUnique({
    where: { id },
    select: { projetoId: true, inicioPrevisto: true, fimPrevisto: true },
  });
  if (!t) throw new ActionError("Tarefa não encontrada.");
  const nos = await db.eapTarefa.findMany({
    where: { projetoId: t.projetoId },
    select: { id: true, parentId: true, ordem: true, tipoEap: true, disciplinaId: true, etapaId: true },
  });
  return { ...t, nos };
}

export const proximaOrdem = async (db: Db, projetoId: string) =>
  ((await db.eapTarefa.aggregate({ where: { projetoId }, _max: { ordem: true } }))._max.ordem ?? -1) + 1;

export async function recuarLinha(id: string, db: Db = prisma): Promise<{ projetoId: string; paiVirouAgrupamentoComGente: boolean }> {
  const { projetoId, nos } = await carregar(id, db);
  const plano = planoDeRecuo(nos, id);
  if (!plano.ok) throw new ActionError(plano.motivo);
  // O novo pai vira agrupamento: as horas de quem estava nele deixam de contar (o verificador acusa). Avisa a tela.
  const jaTinhaFilhos = nos.some((n) => n.parentId === plano.novoPaiId);
  // `ext` (Externo) fora da conta: é a marca de etapa de terceiro, sem horas para perder.
  const comGente = jaTinhaFilhos
    ? 0
    : await db.eapAtribuicao.count({ where: { tarefaId: plano.novoPaiId, papel: { not: "ext" } } });
  await emTransacao(db, async (tx) => {
    await tx.eapTarefa.update({ where: { id }, data: { parentId: plano.novoPaiId, ordem: await proximaOrdem(tx, projetoId) } });
  });
  return { projetoId, paiVirouAgrupamentoComGente: comGente > 0 };
}

export async function avancarLinha(id: string, db: Db = prisma): Promise<{ projetoId: string }> {
  const { projetoId, nos } = await carregar(id, db);
  const plano = planoDeAvanco(nos, id);
  if (!plano.ok) throw new ActionError(plano.motivo);
  const pai = nos.find((n) => n.id === plano.depoisDeId)!;
  await emTransacao(db, async (tx) => {
    // Abre um lugar logo depois do pai antigo, entre os irmãos do novo nível.
    await tx.eapTarefa.updateMany({ where: { projetoId, ordem: { gt: pai.ordem } }, data: { ordem: { increment: 1 } } });
    await tx.eapTarefa.update({ where: { id }, data: { parentId: plano.novoPaiId, ordem: pai.ordem + 1 } });
    // As irmãs que vinham depois passam a ser filhas da avançada, DEPOIS das filhas que ela já tinha.
    let ordem = await proximaOrdem(tx, projetoId);
    for (const irmaId of plano.reparentarIds) {
      await tx.eapTarefa.update({ where: { id: irmaId }, data: { parentId: id, ordem: ordem++ } });
    }
  });
  return { projetoId };
}

export async function inserirLinhaAcima(id: string): Promise<{ projetoId: string; novaId: string }> {
  const { projetoId, nos, inicioPrevisto, fimPrevisto } = await carregar(id);
  const plano = planoDeInsercaoAcima(nos, id);
  if (!plano.ok) throw new ActionError(plano.motivo);
  // A1: a disciplina (e a fase) vêm do AGRUPAMENTO onde a linha entra, não da linha de referência — herdar da
  // vizinha criava, por exemplo, uma "Visita técnica" de Hidro com o responsável de Hidro.
  const herdada = disciplinaParaLinhaNova(nos.find((n) => n.id === plano.paiId) ?? null);
  const disciplinaId = herdada.disciplinaId;
  // A fase só vai se a disciplina a tem cadastrada: fase fora da lista dela ficaria invisível no editor.
  const etapaId = await faseDaLinhaNova(prisma, disciplinaId, herdada.etapaId);
  const nova = await prisma.$transaction(async (tx) => {
    await tx.eapTarefa.updateMany({ where: { projetoId, ordem: { gte: plano.aPartirDeOrdem } }, data: { ordem: { increment: 1 } } });
    const [idCorporativo] = await reservarIdsParaLinhas(tx, ["atv"]);
    return tx.eapTarefa.create({
      data: {
        idCorporativo,
        projetoId,
        parentId: plano.paiId,
        // Datas provisórias — o reagendamento grava as do motor.
        disciplinaId,
        etapaId,
        nome: "Nova tarefa",
        tipoEap: "atv",
        duracaoDias: 1,
        progresso: 0,
        ordem: plano.aPartirDeOrdem,
        inicioPrevisto,
        fimPrevisto,
      },
      select: { id: true },
    });
  });
  // D22: o responsável da disciplina desce para a linha nova.
  await herdarResponsaveisNoProjeto(prisma, projetoId, [nova.id]);
  return { projetoId, novaId: nova.id };
}

/** Grava um movimento: o novo pai da linha e as `ordem` das irmãs do novo nível. As subtarefas vão junto sozinhas. */
async function gravarMovimento(id: string, plano: Movimento, db: Db = prisma): Promise<void> {
  if (!plano.ok) throw new ActionError(plano.motivo);
  await emTransacao(db, async (tx) => {
    const propria = plano.ordens.find((o) => o.id === id);
    await tx.eapTarefa.update({ where: { id }, data: { parentId: plano.novoPaiId, ...(propria ? { ordem: propria.ordem } : {}) } });
    for (const o of plano.ordens) {
      if (o.id !== id) await tx.eapTarefa.update({ where: { id: o.id }, data: { ordem: o.ordem } });
    }
  });
}

/**
 * Mover (arrastar a linha): antes/depois de outra linha DO MESMO cronograma, no nível dela. A disciplina da linha não
 * muda com o lugar — trocar de disciplina é na janela da tarefa (mexe em responsável, card e pagamento).
 */
export async function moverLinha(id: string, alvoId: string, posicao: Posicao): Promise<{ projetoId: string }> {
  const { projetoId, nos } = await carregar(id);
  if (!nos.some((n) => n.id === alvoId)) throw new ActionError("A linha de destino não é deste cronograma.");
  await gravarMovimento(id, planoDeMovimento(nos, id, alvoId, posicao));
  return { projetoId };
}

/** Mover para cima (`-1`) ou para baixo (`1`) no mesmo nível. */
export async function moverLinhaNoNivel(id: string, direcao: -1 | 1, db: Db = prisma): Promise<{ projetoId: string }> {
  const { projetoId, nos } = await carregar(id, db);
  await gravarMovimento(id, planoDeMoverNoNivel(nos, id, direcao), db);
  return { projetoId };
}
