import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { diffResponsaveis, disciplinasNaData } from "@/modules/projetos/responsaveis";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * ÚNICO escritor de `DisciplinaResponsavel` (R5 do rateio, decisão 13; guarda em
 * `responsaveis-guarda.test.ts`). Troca os responsáveis da disciplina pela lista nova e grava o
 * histórico: quem sai tem o período fechado em `quando`, quem entra ganha um período aberto. Só a
 * diferença é escrita — quem continua não ganha linha nova. Leituras e escritas em série (pode ser `tx`).
 */
export async function substituirResponsaveis(db: Db, disciplinaId: string, novos: string[], quando: Date = new Date()): Promise<{ entram: string[]; saem: string[] }> {
  const atuais = (await db.disciplinaResponsavel.findMany({ where: { disciplinaId }, select: { userId: true } })).map((r) => r.userId);
  // Responsável atual SEM período aberto no histórico (gravado antes do histórico existir, ou por
  // escrita fora do serviço): ganha um período desde a criação da disciplina antes da troca — senão,
  // ao sair, não haveria período a fechar e os dias em que ele foi responsável sumiriam.
  if (atuais.length > 0) {
    const abertos = new Set(
      (await db.disciplinaResponsavelHistorico.findMany({ where: { disciplinaId, userId: { in: atuais }, fim: null }, select: { userId: true } })).map((h) => h.userId),
    );
    const semPeriodo = atuais.filter((u) => !abertos.has(u));
    if (semPeriodo.length > 0) {
      const disc = await db.disciplina.findUnique({ where: { id: disciplinaId }, select: { createdAt: true } });
      const inicio = disc?.createdAt && disc.createdAt < quando ? disc.createdAt : quando;
      await db.disciplinaResponsavelHistorico.createMany({ data: semPeriodo.map((userId) => ({ disciplinaId, userId, inicio })) });
    }
  }
  const { entram, saem } = diffResponsaveis(atuais, novos);
  if (saem.length > 0) {
    await db.disciplinaResponsavel.deleteMany({ where: { disciplinaId, userId: { in: saem } } });
    await db.disciplinaResponsavelHistorico.updateMany({ where: { disciplinaId, userId: { in: saem }, fim: null }, data: { fim: quando } });
  }
  if (entram.length > 0) {
    await db.disciplinaResponsavel.createMany({ data: entram.map((userId) => ({ disciplinaId, userId })), skipDuplicates: true });
    await db.disciplinaResponsavelHistorico.createMany({ data: entram.map((userId) => ({ disciplinaId, userId, inicio: quando })) });
  }
  return { entram, saem };
}

/**
 * Disciplinas do projeto de que a pessoa era responsável NA DATA (correção de ponto de dia antigo).
 * Responsável de hoje SEM nenhuma linha de histórico naquela disciplina (gravado por script, semente
 * ou antes do histórico) vale pelo responsável de hoje — senão a pessoa ficaria sem disciplina.
 */
export async function disciplinasDaPessoaNaData(db: Db, userId: string, projetoId: string, quando: Date): Promise<string[]> {
  const historico = await db.disciplinaResponsavelHistorico.findMany({
    where: { userId, disciplina: { projetoId } },
    select: { disciplinaId: true, inicio: true, fim: true },
  });
  const atuais = await db.disciplinaResponsavel.findMany({
    where: { userId, disciplina: { projetoId, responsaveisHistorico: { none: { userId } } } },
    select: { disciplinaId: true },
  });
  return [...new Set([...disciplinasNaData(historico, quando), ...atuais.map((a) => a.disciplinaId)])];
}
