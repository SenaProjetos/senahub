import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { avancarLinha, moverLinhaNoNivel, proximaOrdem, type Db } from "./arvore-service";
import {
  MAX_LINHAS_LOTE,
  MOTIVO_NENHUMA_LINHA,
  motivoDaLinha,
  motivoParaAvancarEmLote,
  motivoParaMoverEmLote,
  planoDeRecuoEmLote,
  raizesDaSelecao,
} from "./arvore-lote";

/**
 * Recuar, avançar, mover e excluir VÁRIAS linhas da EAP (I/O) — as decisões estão em `arvore-lote.ts`. Cada função roda
 * numa única transação (tudo ou nada), devolve o projeto e quem chama reagenda UMA vez. A recusa diz a linha que barrou
 * ("Modelagem: Esta tarefa já é a primeira do nível."). Separadas da action para o smoke alcançar a regra sem sessão.
 */

export const MOTIVO_PROJETOS_DIFERENTES = "As linhas escolhidas são de projetos diferentes.";
export const MOTIVO_LINHA_SUMIU = "Alguma das linhas escolhidas não existe mais. Atualize a tela e escolha de novo.";
const MOTIVO_LOTE_GRANDE = `Escolha no máximo ${MAX_LINHAS_LOTE} linhas de uma vez.`;

/** As linhas escolhidas: de UM projeto, todas existentes, dentro do teto. Devolve a árvore do projeto e os nomes. */
export async function carregarLote(ids: readonly string[], db: Db = prisma) {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) throw new ActionError(MOTIVO_NENHUMA_LINHA);
  if (unicos.length > MAX_LINHAS_LOTE) throw new ActionError(MOTIVO_LOTE_GRANDE);
  const escolhidas = await db.eapTarefa.findMany({ where: { id: { in: unicos } }, select: { id: true, nome: true, projetoId: true } });
  if (escolhidas.length !== unicos.length) throw new ActionError(MOTIVO_LINHA_SUMIU);
  const projetoId = escolhidas[0].projetoId;
  if (escolhidas.some((l) => l.projetoId !== projetoId)) throw new ActionError(MOTIVO_PROJETOS_DIFERENTES);
  const nos = await db.eapTarefa.findMany({
    where: { projetoId },
    select: { id: true, parentId: true, ordem: true, tipoEap: true },
  });
  return { projetoId, nos, ids: unicos, nomes: new Map(escolhidas.map((l) => [l.id, l.nome])) };
}

const recusa = (nomes: ReadonlyMap<string, string>, r: { motivo: string; linhaId?: string }) =>
  new ActionError(motivoDaLinha(r.linhaId ? nomes.get(r.linhaId) : undefined, r.motivo));

const TRANSACAO = { timeout: 60_000, maxWait: 30_000 };

export async function recuarEmLote(ids: readonly string[]): Promise<{ projetoId: string; linhas: number; paisComGente: number }> {
  const { projetoId, nos, ids: unicos, nomes } = await carregarLote(ids);
  const plano = planoDeRecuoEmLote(nos, unicos);
  if (!plano.ok) throw recusa(nomes, plano);
  // O novo pai que ainda não tinha filhas vira agrupamento: as horas de quem estava nele deixam de contar (o verificador
  // acusa). `ext` (Externo) fica fora da conta: é a marca de etapa de terceiro, sem horas para perder.
  const paisNovos = [...new Set(plano.movimentos.map((m) => m.novoPaiId))].filter((p) => !nos.some((n) => n.parentId === p));
  const comGente =
    paisNovos.length === 0
      ? []
      : await prisma.eapAtribuicao.findMany({ where: { tarefaId: { in: paisNovos }, papel: { not: "ext" } }, select: { tarefaId: true }, distinct: ["tarefaId"] });
  await prisma.$transaction(async (tx) => {
    let ordem = await proximaOrdem(tx, projetoId);
    for (const m of plano.movimentos) await tx.eapTarefa.update({ where: { id: m.id }, data: { parentId: m.novoPaiId, ordem: ordem++ } });
  }, TRANSACAO);
  return { projetoId, linhas: plano.movimentos.length, paisComGente: comGente.length };
}

export async function avancarEmLote(ids: readonly string[]): Promise<{ projetoId: string; linhas: number }> {
  const { projetoId, nos, ids: unicos, nomes } = await carregarLote(ids);
  const motivo = motivoParaAvancarEmLote(nos, unicos);
  if (motivo) throw recusa(nomes, motivo);
  const raizes = raizesDaSelecao(nos, unicos);
  // Uma linha por vez, em ordem de documento e na MESMA transação: cada `avancarLinha` relê a árvore já com o que a
  // anterior gravou (as irmãs de baixo passam a ser filhas da avançada, e a próxima da lista pode ser uma delas).
  await prisma.$transaction(async (tx) => {
    for (const id of raizes) await avancarLinha(id, tx);
  }, TRANSACAO);
  return { projetoId, linhas: raizes.length };
}

export async function moverEmLote(ids: readonly string[], direcao: -1 | 1): Promise<{ projetoId: string; linhas: number }> {
  const { projetoId, nos, ids: unicos, nomes } = await carregarLote(ids);
  const motivo = motivoParaMoverEmLote(nos, unicos, direcao);
  if (motivo) throw recusa(nomes, motivo);
  const raizes = raizesDaSelecao(nos, unicos);
  // Para cima, de cima para baixo; para baixo, de baixo para cima: cada uma só troca com uma irmã que NÃO está no bloco.
  const ordenadas = direcao === -1 ? raizes : [...raizes].reverse();
  await prisma.$transaction(async (tx) => {
    for (const id of ordenadas) await moverLinhaNoNivel(id, direcao, tx);
  }, TRANSACAO);
  return { projetoId, linhas: raizes.length };
}

/** Exclui as raízes da seleção (as subtarefas caem por cascade). `excluidas` conta as linhas que saíram, subtarefas inclusas. */
export async function excluirEmLote(ids: readonly string[]): Promise<{ projetoId: string; linhas: number; excluidas: number }> {
  const { projetoId, nos, ids: unicos } = await carregarLote(ids);
  const raizes = raizesDaSelecao(nos, unicos);
  const saem = new Set(raizes);
  // Descendentes das raízes (a lista `nos` não vem em ordem de árvore: repete até não entrar mais ninguém).
  for (let entrou = true; entrou; ) {
    entrou = false;
    for (const n of nos) {
      if (n.parentId && saem.has(n.parentId) && !saem.has(n.id)) {
        saem.add(n.id);
        entrou = true;
      }
    }
  }
  await prisma.eapTarefa.deleteMany({ where: { id: { in: raizes } } });
  return { projetoId, linhas: raizes.length, excluidas: saem.size };
}
