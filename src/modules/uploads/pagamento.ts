import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { criarDespesaProjetistaPrevista } from "@/modules/financeiro/custo/lancamento-custo";
import { ratearPagamentoProjetista } from "@/modules/uploads/rateio";
import {
  planejarSincronizacao,
  bloqueioSincronizacao,
  planoVazio,
  type PagamentoAtual,
} from "@/modules/uploads/sincronizacao-pagamento";

type ResponsavelComUser = {
  userId: string;
  user: { id: string; name: string; role: string };
};

/**
 * Libera um `PagamentoProjetista` pendente por responsável PJ/freelancer da disciplina
 * (CLT/estagiário não recebem por entrega — custo já entra via ponto/rateio de horas) e
 * lança a despesa PREVISTA correspondente no financeiro. Fonte única compartilhada por
 * `validarEntrega` (fluxo legado, por-arquivo) e `confirmarAprovacaoDisciplina` (fluxo
 * de 2 etapas de aprovação/laudo) — mesma regra de cálculo (sobra de centavos no
 * primeiro responsável) e mesma integração financeira nos dois casos.
 */
export async function liberarPagamentosProjetista(
  tx: Prisma.TransactionClient,
  params: {
    disciplina: {
      id: string;
      disciplinaTextoLegado: string;
      valor: Prisma.Decimal | number | null;
      responsaveis: ResponsavelComUser[];
      projeto: { id: string; codigo: string };
    };
    autorId: string;
    agora: Date;
  },
): Promise<{ pagaveis: ResponsavelComUser[]; salariados: ResponsavelComUser[] }> {
  const { disciplina, autorId, agora } = params;
  const valorTotal = disciplina.valor ? Number(disciplina.valor) : 0;
  // Divisão (só entre pagáveis, sobra de centavos no primeiro) vive em `rateio.ts`, puro e testado.
  const { pagaveis: cotas, salariados } = ratearPagamentoProjetista(
    disciplina.responsaveis,
    valorTotal,
  );

  for (const { responsavel: r, valor } of cotas) {
    const pag = await tx.pagamentoProjetista.create({
      data: {
        disciplinaId: disciplina.id,
        projetistaId: r.userId,
        valor,
        tipoProfissional: r.user.role,
        status: "pendente",
        liberadoEm: agora,
      },
    });
    if (valor > 0) {
      const lancamentoId = await criarDespesaProjetistaPrevista(tx, {
        pagamentoId: pag.id,
        valor,
        tipoProfissional: r.user.role,
        projetistaNome: r.user.name,
        disciplinaNome: disciplina.disciplinaTextoLegado,
        projetoId: disciplina.projeto.id,
        projetoCodigo: disciplina.projeto.codigo,
        autorId,
        quando: agora,
      });
      await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { lancamentoId } });
    }
  }

  return { pagaveis: cotas.map((c) => c.responsavel), salariados };
}

/**
 * Reescreve `Disciplina.valor` como a soma dos pagamentos não-cancelados da disciplina —
 * chamado depois de editar/cancelar um pagamento DIRETO na folha (F4).
 *
 * Sem isso a edição/cancelamento é revertida em silêncio na próxima vez que alguém mexer
 * em valor/responsáveis dessa disciplina: `sincronizarPagamentosDisciplina` reparte
 * `Disciplina.valor` — se ele não acompanhasse o pagamento editado, o rateio recalcularia
 * a partir do total antigo e cancelaria/recriaria por cima do ajuste manual. O pool
 * (soma) sempre bate com os pagamentos vivos — é exatamente a invariante que o próprio
 * rateio mantém quando alguém sai (o remanescente herda o pool inteiro).
 */
export async function sincronizarValorDisciplina(tx: Prisma.TransactionClient, disciplinaId: string) {
  const agg = await tx.pagamentoProjetista.aggregate({
    where: { disciplinaId, status: { not: "cancelado" } },
    _sum: { valor: true },
  });
  await tx.disciplina.update({ where: { id: disciplinaId }, data: { valor: agg._sum.valor ?? 0 } });
}

/**
 * Recarrega a disciplina (já com o estado NOVO, dentro da mesma transação) e sincroniza.
 * Atalho para os call sites que acabaram de gravar valor/responsáveis e não têm o objeto
 * completo em mãos.
 */
export async function sincronizarPagamentosPorDisciplinaId(
  tx: Prisma.TransactionClient,
  disciplinaId: string,
  autorId: string,
) {
  const disciplina = await tx.disciplina.findUnique({
    where: { id: disciplinaId },
    select: {
      id: true,
      disciplinaTextoLegado: true,
      valor: true,
      responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
      projeto: { select: { id: true, codigo: true } },
    },
  });
  if (!disciplina) return { atualizados: 0, cancelados: 0, criados: 0 };
  return sincronizarPagamentosDisciplina(tx, { disciplina, autorId });
}

/**
 * Propaga uma alteração de valor/responsáveis da disciplina para os pagamentos JÁ
 * liberados e seus lançamentos — irmã de `sincronizarDespesaServico`, mesma ideia de
 * convergência idempotente. Só age sobre pendentes; recusa (ActionError) se algum
 * pagamento já foi efetivado.
 *
 * Sem isso, corrigir o valor de uma disciplina concluída não chegava ao financeiro: a
 * linha continuava na folha com o valor velho (ou R$ 0,00, sem lançamento nenhum) e o
 * próprio pagamento zerado impedia a regeneração, porque `jaTemPagamento` conta
 * qualquer pagamento — inclusive o de valor zero.
 *
 * Cancelar DESTACA o pagamento do lote (`folhaId: null`): `pagarFolhaProjetista` itera
 * os pagamentos do lote por `status != pago`, então uma linha cancelada que ficasse
 * vinculada seria paga assim mesmo.
 */
export async function sincronizarPagamentosDisciplina(
  tx: Prisma.TransactionClient,
  params: {
    disciplina: {
      id: string;
      disciplinaTextoLegado: string;
      valor: Prisma.Decimal | number | null;
      responsaveis: ResponsavelComUser[];
      projeto: { id: string; codigo: string };
    };
    autorId: string;
  },
): Promise<{ atualizados: number; cancelados: number; criados: number }> {
  const { disciplina, autorId } = params;

  const existentes = await tx.pagamentoProjetista.findMany({
    where: { disciplinaId: disciplina.id },
    select: { id: true, projetistaId: true, valor: true, status: true, folhaId: true, lancamentoId: true },
  });
  if (existentes.length === 0) return { atualizados: 0, cancelados: 0, criados: 0 };

  const atuais: PagamentoAtual[] = existentes.map((p) => ({
    id: p.id,
    projetistaId: p.projetistaId,
    valor: Number(p.valor),
    status: p.status,
  }));

  const bloqueio = bloqueioSincronizacao(atuais);
  if (bloqueio) throw new ActionError(bloqueio);

  const valorTotal = disciplina.valor ? Number(disciplina.valor) : 0;
  const { pagaveis } = ratearPagamentoProjetista(disciplina.responsaveis, valorTotal);
  const plano = planejarSincronizacao(
    atuais,
    pagaveis.map((c) => ({ userId: c.responsavel.userId, valor: c.valor })),
  );
  if (planoVazio(plano)) return { atualizados: 0, cancelados: 0, criados: 0 };

  const porId = new Map(existentes.map((p) => [p.id, p]));
  const porUserId = new Map(disciplina.responsaveis.map((r) => [r.userId, r]));
  // Lotes tocados: o total da folha é agregado gravado, precisa ser recalculado.
  const lotesTocados = new Set<string>();
  const agora = new Date();

  for (const { pagamentoId, valor } of plano.atualizar) {
    const pag = porId.get(pagamentoId)!;
    const resp = porUserId.get(pag.projetistaId);
    await tx.pagamentoProjetista.update({ where: { id: pagamentoId }, data: { valor } });
    if (pag.folhaId) lotesTocados.add(pag.folhaId);

    // Sincroniza o lançamento previsto. Cria quando falta — é o caso das linhas de
    // R$ 0,00, que nunca ganharam lançamento (a criação exige valor > 0).
    if (pag.lancamentoId) {
      await tx.lancamento.updateMany({
        where: { id: pag.lancamentoId, status: { not: "cancelado" } },
        data: { valor },
      });
    } else if (resp) {
      const lancamentoId = await criarDespesaProjetistaPrevista(tx, {
        pagamentoId,
        valor,
        tipoProfissional: resp.user.role,
        projetistaNome: resp.user.name,
        disciplinaNome: disciplina.disciplinaTextoLegado,
        projetoId: disciplina.projeto.id,
        projetoCodigo: disciplina.projeto.codigo,
        autorId,
        quando: agora,
      });
      await tx.pagamentoProjetista.update({ where: { id: pagamentoId }, data: { lancamentoId } });
    }
  }

  for (const { pagamentoId } of plano.cancelar) {
    const pag = porId.get(pagamentoId)!;
    await tx.pagamentoProjetista.update({
      where: { id: pagamentoId },
      data: { status: "cancelado", folhaId: null },
    });
    if (pag.folhaId) lotesTocados.add(pag.folhaId);
    if (pag.lancamentoId) {
      await tx.lancamento.updateMany({
        where: { id: pag.lancamentoId, status: { not: "cancelado" } },
        data: { status: "cancelado" },
      });
    }
  }

  for (const { userId, valor } of plano.criar) {
    const resp = porUserId.get(userId);
    if (!resp) continue;
    const pag = await tx.pagamentoProjetista.create({
      data: {
        disciplinaId: disciplina.id,
        projetistaId: userId,
        valor,
        tipoProfissional: resp.user.role,
        status: "pendente",
        liberadoEm: agora,
      },
    });
    const lancamentoId = await criarDespesaProjetistaPrevista(tx, {
      pagamentoId: pag.id,
      valor,
      tipoProfissional: resp.user.role,
      projetistaNome: resp.user.name,
      disciplinaNome: disciplina.disciplinaTextoLegado,
      projetoId: disciplina.projeto.id,
      projetoCodigo: disciplina.projeto.codigo,
      autorId,
      quando: agora,
    });
    await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { lancamentoId } });
  }

  for (const folhaId of lotesTocados) {
    const agg = await tx.pagamentoProjetista.aggregate({
      where: { folhaId, status: { not: "cancelado" } },
      _sum: { valor: true },
    });
    await tx.folhaProjetista.update({ where: { id: folhaId }, data: { total: agg._sum.valor ?? 0 } });
  }

  return {
    atualizados: plano.atualizar.length,
    cancelados: plano.cancelar.length,
    criados: plano.criar.length,
  };
}
