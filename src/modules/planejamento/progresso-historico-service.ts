import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaLocal } from "@/lib/data";
import { paraDia } from "./agenda";
import { progressoNaData, linhasSemHistorico, type RegistroProgresso } from "./progresso-historico";

/**
 * Histórico do % concluído — o I/O (decisão #17). As regras estão em `progresso-historico.ts`.
 *
 * Esta tabela existe para a CONTA do Valor Agregado, não para a tela: quem informou qual percentual e
 * quando já aparece no histórico do projeto, pela auditoria da própria ação (`editar-eap` passa por
 * `defineAction`). Por isso não há leitura por linha aqui — se um dia a tela quiser mostrar a série do
 * avanço, ela nasce de uma consulta nova, sem mexer na gravação.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Grava uma mudança de %. Chamado NA MESMA TRANSAÇÃO do `update` da linha: gravar depois deixaria a
 * janela em que a linha já mudou e o histórico ainda não sabe — e é justamente o histórico que responde
 * pelo número que o Valor Agregado publica.
 *
 * Não grava o que não mudou (evita uma linha por clique em Salvar) nem linha-resumo (o % de resumo é
 * rollup do motor, não informação de ninguém).
 */
export async function registrarProgresso(
  db: Db,
  p: {
    tarefaId: string;
    projetoId: string;
    anterior: number;
    progresso: number;
    autorId: string | null;
    origem: "informado" | "execucao";
    /** Linha-resumo não entra. Quem chama já sabe (contou as filhas). */
    ehResumo?: boolean;
  },
): Promise<boolean> {
  if (p.ehResumo) return false;
  if (!Number.isFinite(p.progresso) || p.progresso === p.anterior) return false;

  // A Data de Status vigente AGORA: é o que permite contar a atualização feita na segunda como
  // referente à sexta que estava apurada. Depois não há como reconstruir este valor.
  const cron = await db.cronogramaProjeto.findUnique({
    where: { projetoId: p.projetoId },
    select: { dataStatus: true },
  });

  await db.eapProgressoRegistro.create({
    data: {
      tarefaId: p.tarefaId,
      anterior: Math.max(0, Math.min(100, Math.round(p.anterior))),
      progresso: Math.max(0, Math.min(100, Math.round(p.progresso))),
      dataStatusVigente: cron?.dataStatus ?? null,
      origem: p.origem,
      autorId: p.autorId,
    },
  });
  return true;
}

/**
 * O % de cada linha do projeto na `dataStatus` (decisão #17) + quais linhas não têm histórico e por isso
 * ficaram com o valor de hoje.
 *
 * `atuais` vem de quem chama (o motor já leu as linhas): evita uma segunda leitura da EAP e garante que o
 * fallback use o MESMO número que a tela mostra.
 */
export async function progressoDoProjetoNaData(
  projetoId: string,
  dataStatus: string,
  atuais: ReadonlyMap<string, number>,
): Promise<{ progresso: Map<string, number>; semHistorico: string[] }> {
  const registros = await prisma.eapProgressoRegistro.findMany({
    where: { tarefa: { projetoId } },
    select: { tarefaId: true, progresso: true, anterior: true, em: true, dataStatusVigente: true },
    orderBy: { em: "asc" },
  });

  const convertidos: RegistroProgresso[] = registros.map((r) => ({
    tarefaId: r.tarefaId,
    progresso: r.progresso,
    anterior: r.anterior,
    // Dia LOCAL da gravação: é o dia de trabalho de quem digitou que a regra compara com a Data de
    // Status. Em UTC puro, o que for digitado depois das 21 h cairia no dia seguinte. `inicioDoDiaLocal`
    // é a regra única do fuso (`lib/data.ts`) — não repetir o "-3 h" aqui.
    emDia: paraDia(inicioDoDiaLocal(r.em)),
    emOrdem: r.em.getTime(),
    dataStatus: r.dataStatusVigente ? paraDia(r.dataStatusVigente) : null,
  }));

  return {
    progresso: progressoNaData(convertidos, dataStatus, atuais),
    semHistorico: linhasSemHistorico(convertidos, atuais),
  };
}
