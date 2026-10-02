import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { inicioDoDiaUtc } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { competenciasAGerar, idDoProgramado, rotuloDaCompetencia } from "@/modules/financeiro/recorrencia/calculo";
import { anosDoHorizonte, calendarioFinanceiro, competenciasVinculadas, compromissosAtivos } from "@/modules/financeiro/recorrencia/queries";

/**
 * Geração dos lançamentos de compromissos recorrentes (ADR-0009, D6). Idempotente por construção: o
 * par `(recorrenciaOrigemId, recorrenciaCompetencia)` é único no banco, então duas execuções ao mesmo
 * tempo (job + botão) criam o mês uma vez só — a segunda recebe P2002 e segue.
 *
 * O lançamento nasce PREVISTO, sem passar pela alçada: o valor já foi aprovado ao cadastrar o
 * compromisso, e travá-lo em "aguardando aprovação" todo mês só atrasaria o pagamento.
 */
export type ResultadoGeracao = { criados: number; porCompromisso: { id: string; descricao: string; competencias: string[] }[] };

export async function gerarLancamentosRecorrentes(o: { autorId: string; agora?: Date } = { autorId: "" }): Promise<ResultadoGeracao> {
  const hoje = isoDeDataDoBanco(inicioDoDiaUtc(o.agora));
  const [compromissos, vinculadas] = await Promise.all([compromissosAtivos(), competenciasVinculadas()]);
  if (compromissos.length === 0) return { criados: 0, porCompromisso: [] };

  // Sem autor explícito (job), o lançamento fica no nome de um admin ativo: `Lancamento.autorId` é
  // obrigatório e a auditoria precisa de alguém de verdade.
  const autorId = o.autorId || (await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } }))?.id;
  if (!autorId) throw new ActionError("Nenhum usuário disponível para registrar os lançamentos.");
  const calendario = await calendarioFinanceiro(anosDoHorizonte(hoje, hoje));

  const porCompromisso: ResultadoGeracao["porCompromisso"] = [];
  let criados = 0;
  for (const c of compromissos) {
    const feitas: string[] = [];
    for (const { competencia, vencimento } of competenciasAGerar(c, { hoje, vinculadas, calendario })) {
      try {
        await prisma.lancamento.create({
          data: {
            tipo: "despesa",
            descricao: `${c.descricao} · ${rotuloDaCompetencia(competencia)}`,
            valor: c.valor / 100,
            status: "previsto",
            data: new Date(`${vencimento}T00:00:00.000Z`),
            vencimento: new Date(`${vencimento}T00:00:00.000Z`),
            // A DRE por competência é competência pura (decisão do dono): o mês a que a despesa
            // pertence, não o do vencimento — a folha de setembro paga em outubro é de setembro.
            dataCompetencia: new Date(`${competencia}-01T00:00:00.000Z`),
            categoriaId: c.categoriaId,
            prioridade: c.prioridade,
            caixinhaId: c.caixinhaId,
            socioId: c.socioId,
            recorrenciaOrigemId: c.id,
            recorrenciaCompetencia: competencia,
            autorId,
          },
        });
        vinculadas.add(idDoProgramado(c.id, competencia));
        feitas.push(competencia);
        criados++;
      } catch (e) {
        // P2002 = outra execução criou este mês primeiro. É o resultado desejado, não um erro.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        vinculadas.add(idDoProgramado(c.id, competencia));
      }
    }
    if (feitas.length) porCompromisso.push({ id: c.id, descricao: c.descricao, competencias: feitas });
  }
  return { criados, porCompromisso };
}

/**
 * Liga um lançamento manual ao mês programado (§9). Daí em diante vale o valor do lançamento, e a
 * diferença vira aviso. Exige que a competência ainda esteja livre — o par único garante no banco.
 */
export async function vincularLancamento(p: { lancamentoId: string; compromissoId: string; competencia: string }): Promise<void> {
  const [l, c] = await Promise.all([
    prisma.lancamento.findUnique({
      where: { id: p.lancamentoId },
      select: { excluidoEm: true, tipo: true, status: true, categoriaId: true, socioId: true, recorrenciaOrigemId: true },
    }),
    prisma.compromissoRecorrente.findUnique({ where: { id: p.compromissoId }, select: { categoriaId: true, socioId: true, competenciaInicio: true, competenciaFim: true } }),
  ]);
  if (!l || l.excluidoEm) throw new ActionError("Lançamento não encontrado.");
  if (!c) throw new ActionError("Compromisso recorrente não encontrado.");
  if (l.recorrenciaOrigemId) throw new ActionError("Este lançamento já está vinculado a uma recorrência.");
  if (l.tipo !== "despesa") throw new ActionError("Só uma conta a pagar se vincula a um compromisso recorrente.");
  if (l.status === "cancelado") throw new ActionError("Lançamento cancelado.");
  if (l.categoriaId !== c.categoriaId || (l.socioId ?? null) !== (c.socioId ?? null)) {
    throw new ActionError("O lançamento precisa ser da mesma categoria e do mesmo sócio do compromisso.");
  }
  if (p.competencia < c.competenciaInicio || (c.competenciaFim != null && p.competencia > c.competenciaFim)) {
    throw new ActionError("A competência está fora da vigência do compromisso.");
  }
  try {
    await prisma.lancamento.update({
      where: { id: p.lancamentoId },
      data: { recorrenciaOrigemId: p.compromissoId, recorrenciaCompetencia: p.competencia },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ActionError(`${rotuloDaCompetencia(p.competencia)} já tem um lançamento vinculado a este compromisso.`);
    }
    throw e;
  }
}

export async function desvincularLancamento(lancamentoId: string): Promise<void> {
  const l = await prisma.lancamento.findUnique({ where: { id: lancamentoId }, select: { excluidoEm: true, recorrenciaOrigemId: true } });
  if (!l || l.excluidoEm) throw new ActionError("Lançamento não encontrado.");
  if (!l.recorrenciaOrigemId) throw new ActionError("Este lançamento não está vinculado a uma recorrência.");
  await prisma.lancamento.update({ where: { id: lancamentoId }, data: { recorrenciaOrigemId: null, recorrenciaCompetencia: null } });
}
