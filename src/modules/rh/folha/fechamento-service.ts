import "server-only";

/**
 * Fechar e reabrir a folha CLT no banco — o mesmo código que a Server Action usa e que o
 * `smoke:planejador` exercita (as actions precisam de sessão; o smoke não tem uma).
 *
 * F6D do planejador financeiro: o compromisso recorrente de folha (F6A) já deixa a conta a pagar
 * PREVISTA da competência. Antes, fechar criava um lançamento NOVO e o mês ficava com os dois — o
 * caixa projetado perdia a folha duas vezes. Agora o fechamento QUITA o previsto com o valor real;
 * a decisão de QUAL previsto é pura (`quitacao.ts`).
 */
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { paraCentavos, paraReais } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { rotuloFolha } from "@/modules/rh/folha/tipo-folha";
import {
  avisoDaQuitacao,
  competenciaDaFolha,
  desfazerQuitacao,
  escolherPendenteDaFolha,
  folhaQuitaPrevisto,
  type PendenteDaFolha,
} from "@/modules/rh/folha/quitacao";

export type ResultadoFechamento = {
  liquido: number;
  /** `true` = quitou uma conta a pagar que já existia, em vez de criar outra despesa. */
  quitou: boolean;
  lancamentoId: string;
  /** Frase para a tela: diferença entre previsto e real, e o que ficou em aberto. */
  aviso: string | null;
};

/**
 * Contas a pagar de folha CLT em aberto na competência: a da recorrência (pelo vínculo) e as do mês
 * pelo vencimento (`vencimento ?? data`, I4). `excluidoEm: null` explícito porque a extensão de soft
 * delete não cobre toda consulta (C3).
 */
export async function pendentesDaCompetencia(
  categoriaId: string,
  ano: number,
  mes: number,
  competencia: string,
): Promise<PendenteDaFolha[]> {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1));
  const rows = await prisma.lancamento.findMany({
    where: {
      excluidoEm: null,
      tipo: "despesa",
      categoriaId,
      status: { in: ["previsto", "aguardando_aprovacao"] },
      OR: [
        { recorrenciaCompetencia: competencia },
        { vencimento: { gte: inicio, lt: fim } },
        { AND: [{ vencimento: null }, { data: { gte: inicio, lt: fim } }] },
      ],
    },
    select: { id: true, valor: true, status: true, vencimento: true, data: true, recorrenciaCompetencia: true },
  });
  return rows.map((l) => ({
    id: l.id,
    valor: paraCentavos(l.valor),
    status: l.status === "aguardando_aprovacao" ? "aguardando_aprovacao" : "previsto",
    vencimento: isoDeDataDoBanco(l.vencimento ?? l.data),
    recorrenciaCompetencia: l.recorrenciaCompetencia,
  }));
}

/** Categoria da folha CLT pela CHAVE — `codigo` é editável em Cadastros (C1 do planejador). */
async function categoriaDaFolha() {
  const c =
    (await prisma.categoriaFinanceira.findUnique({ where: { chave: "despesa_folha_clt" }, select: { id: true } })) ??
    (await prisma.categoriaFinanceira.findUnique({ where: { codigo: "2.03" }, select: { id: true } }));
  if (!c) throw new ActionError("Categoria 2.03 (Folha CLT) ausente no plano de contas.");
  return c;
}

export async function fecharFolhaNoBanco(folhaId: string, autorId: string): Promise<ResultadoFechamento> {
  const folha = await prisma.folhaPagamento.findUnique({
    where: { id: folhaId },
    include: { holerites: { include: { itens: true } } },
  });
  if (!folha) throw new ActionError("Folha não encontrada.");
  if (folha.status === "fechada") throw new ActionError("Folha já fechada.");
  if (folha.holerites.length === 0) throw new ActionError("Adicione holerites antes de fechar.");

  let liquido = 0;
  for (const h of folha.holerites) {
    for (const it of h.itens) {
      liquido += it.tipo === "provento" ? Number(it.valor) : -Number(it.valor);
    }
  }
  if (liquido <= 0) throw new ActionError("Total líquido deve ser positivo.");

  const categoria = await categoriaDaFolha();
  const competencia = competenciaDaFolha(folha);
  // Só a mensal quita: a de 13º é outra despesa, com folha própria no mesmo mês.
  const quitacao = folhaQuitaPrevisto(folha.tipo)
    ? escolherPendenteDaFolha(await pendentesDaCompetencia(categoria.id, folha.ano, folha.mes, competencia), competencia)
    : { escolhido: null, outros: [] };

  const agora = new Date();
  const descricao = `Folha CLT ${rotuloFolha(folha)}`;
  const gravado = await prisma.$transaction(async (tx) => {
    if (quitacao.escolhido) {
      // Condicionado ao status lido: se alguém pagou ou cancelou a conta no meio, nada é
      // sobrescrito e o fechamento cria o lançamento dele (mesmo padrão do aplicar do planejador).
      const r = await tx.lancamento.updateMany({
        where: { id: quitacao.escolhido.id, status: "previsto", excluidoEm: null },
        data: { descricao, valor: liquido, status: "confirmado", dataConfirmacao: agora },
      });
      if (r.count === 1) {
        await tx.folhaPagamento.update({
          where: { id: folha.id },
          data: {
            status: "fechada",
            fechadaEm: agora,
            lancamentoId: quitacao.escolhido.id,
            lancamentoReaproveitado: true,
            lancamentoValorPrevisto: paraReais(quitacao.escolhido.valor),
          },
        });
        return { quitou: true, lancamentoId: quitacao.escolhido.id };
      }
    }
    const lanc = await tx.lancamento.create({
      data: {
        tipo: "despesa",
        descricao,
        valor: liquido,
        status: "confirmado",
        data: agora,
        dataConfirmacao: agora,
        categoriaId: categoria.id,
        autorId,
      },
      select: { id: true },
    });
    await tx.folhaPagamento.update({
      where: { id: folha.id },
      data: {
        status: "fechada",
        fechadaEm: agora,
        lancamentoId: lanc.id,
        lancamentoReaproveitado: false,
        lancamentoValorPrevisto: null,
      },
    });
    return { quitou: false, lancamentoId: lanc.id };
  });

  return {
    liquido,
    quitou: gravado.quitou,
    lancamentoId: gravado.lancamentoId,
    aviso: avisoDaQuitacao(
      { escolhido: gravado.quitou ? quitacao.escolhido : null, outros: quitacao.outros },
      paraCentavos(liquido),
    ),
  };
}

/**
 * Reabre a folha e desfaz o que o fechamento fez com o lançamento: criado pelo fechamento é
 * excluído; conta a pagar que já existia e foi quitada volta ao previsto com o valor que tinha —
 * apagar levaria embora a conta a pagar de outra pessoa.
 *
 * Reabrir também revoga as assinaturas: reabrir libera editar os itens de novo, e um holerite
 * assinado descreveria itens que podem não ser mais os gravados (ver `service.ts`).
 */
export async function reabrirFolhaNoBanco(folhaId: string): Promise<{ assinaturasRevogadas: number }> {
  const folha = await prisma.folhaPagamento.findUnique({ where: { id: folhaId } });
  if (!folha) throw new ActionError("Folha não encontrada.");
  if (folha.status !== "fechada") throw new ActionError("Folha não está fechada.");

  const assinaturasRevogadas = await prisma.$transaction(async (tx) => {
    await tx.folhaPagamento.update({
      where: { id: folhaId },
      data: { status: "aberta", fechadaEm: null, lancamentoId: null, lancamentoReaproveitado: false, lancamentoValorPrevisto: null },
    });
    const desfazer = desfazerQuitacao({
      lancamentoId: folha.lancamentoId,
      lancamentoReaproveitado: folha.lancamentoReaproveitado,
      lancamentoValorPrevisto: folha.lancamentoValorPrevisto === null ? null : paraCentavos(folha.lancamentoValorPrevisto),
    });
    if (desfazer.acao === "apagar") {
      await tx.lancamento.delete({ where: { id: desfazer.id } }).catch(() => {});
    } else if (desfazer.acao === "reverter") {
      await tx.lancamento.updateMany({
        where: { id: desfazer.id, excluidoEm: null },
        data: {
          status: "previsto",
          dataConfirmacao: null,
          ...(desfazer.valor === null ? {} : { valor: paraReais(desfazer.valor) }),
        },
      });
    }
    const r = await tx.holerite.updateMany({
      where: { folhaId, assinadoEm: { not: null } },
      data: { assinadoEm: null, assinanteId: null },
    });
    return r.count;
  });
  return { assinaturasRevogadas };
}
