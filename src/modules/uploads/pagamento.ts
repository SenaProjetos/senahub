import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { criarDespesaProjetistaPrevista } from "@/modules/financeiro/custo/lancamento-custo";
import { recalcularTotalFolha } from "@/modules/financeiro/folha-lote/service";
import { ehPagavel, ratearPagamentoProjetista } from "@/modules/uploads/rateio";
import {
  planejarSincronizacao,
  bloqueioSincronizacao,
  planoVazio,
  type PagamentoAtual,
} from "@/modules/uploads/sincronizacao-pagamento";
import {
  MOTIVO_JA_PAGA_INTEIRA,
  bloqueioValorEmModoFase,
  estadoPagamento,
  modoPagamento,
  poolsDasFasesPendentes,
  rotuloDisciplinaPagamento,
  writeBackFase,
  type EstadoPagamento,
  type FaseParaPagamento,
} from "@/modules/uploads/pagamento-fase";

type ResponsavelComUser = {
  userId: string;
  user: { id: string; name: string; role: string };
};

type Db = Prisma.TransactionClient;

type FaseComSigla = FaseParaPagamento & { sigla: string };

async function fasesDaDisciplina(tx: Db, disciplinaId: string): Promise<FaseComSigla[]> {
  const fases = await tx.disciplinaEtapa.findMany({
    where: { disciplinaId },
    select: {
      id: true,
      ordem: true,
      percentual: true,
      liberadaEm: true,
      valorPagamento: true,
      etapa: { select: { sigla: true } },
    },
  });
  return fases.map((f) => ({
    id: f.id,
    ordem: f.ordem,
    percentual: Number(f.percentual),
    liberadaEm: f.liberadaEm,
    valorPagamento: f.valorPagamento == null ? null : Number(f.valorPagamento),
    sigla: f.etapa.sigla,
  }));
}

/** `estadoPagamento` lido do banco — ver a regra pura para o que "já liberou tudo" quer dizer. */
export async function situacaoPagamento(tx: Db, disciplinaId: string): Promise<EstadoPagamento> {
  // Em sequência, não `Promise.all`: dentro de transação é a MESMA conexão, e consulta em
  // paralelo nela é depreciada no driver pg (some no pg@9).
  const pagamentos = await tx.pagamentoProjetista.findMany({ where: { disciplinaId }, select: { etapaId: true, status: true } });
  const fases = await tx.disciplinaEtapa.findMany({ where: { disciplinaId }, select: { liberadaEm: true } });
  return estadoPagamento(pagamentos, fases);
}

/**
 * Libera o pagamento de UMA fase (F7.4 — D31): fixa o pool dela pela regra do "que falta"
 * (`poolsDasFasesPendentes`), marca a fase liberada/aprovada e cria um `PagamentoProjetista`
 * por responsável pagável — com `etapaId` —, cada um com a sua despesa prevista.
 *
 * Idempotente: fase já liberada devolve `jaLiberada` sem tocar em nada. Recusa (ActionError)
 * disciplina que já pagou INTEIRA (um modo só) e percentuais que não fecham 100%.
 *
 * Fase de pool zero (0%, "a fase é só cronograma") é liberada SEM pagamento — criar linha de
 * R$ 0,00 recriaria exatamente a linha morta na Produção que motivou a trava de valor.
 */
export async function liberarPagamentosDaFase(
  tx: Db,
  params: {
    disciplina: {
      id: string;
      disciplinaTextoLegado: string;
      valor: Prisma.Decimal | number | null;
      responsaveis: ResponsavelComUser[];
      projeto: { id: string; codigo: string };
    };
    faseId: string;
    autorId: string;
    agora: Date;
  },
): Promise<{ pagaveis: ResponsavelComUser[]; salariados: ResponsavelComUser[]; pool: number; jaLiberada: boolean }> {
  const { disciplina, faseId, autorId, agora } = params;
  const fases = await fasesDaDisciplina(tx, disciplina.id);
  const pagamentos = await tx.pagamentoProjetista.findMany({
    where: { disciplinaId: disciplina.id },
    select: { etapaId: true, status: true },
  });
  const fase = fases.find((f) => f.id === faseId);
  if (!fase) throw new ActionError("Fase não encontrada nesta disciplina.");
  if (fase.liberadaEm != null) return { pagaveis: [], salariados: [], pool: fase.valorPagamento ?? 0, jaLiberada: true };
  if (modoPagamento(pagamentos, fases) === "disciplina") throw new ActionError(MOTIVO_JA_PAGA_INTEIRA);

  // Decisão #9 (2026-09-25): disciplina sem ninguém a pagar (100% CLT, ou ainda sem responsável) tem a
  // fase LIBERADA com R$ 0 — não apenas "aprovada". Deixá-la pendente fazia o % dela continuar disputando
  // o pool: bastava um PJ entrar depois para essa fase, já aprovada, voltar a pagar. Liberada em zero, o %
  // dela passa para as fases que faltam (regra 2 de `pagamento-fase`).
  //
  // Sem exigir soma 100% dos percentuais: aqui não há dinheiro a repartir, e travar a aprovação de uma
  // fase de equipe própria por causa de um plano de percentual em rascunho seria trava sem motivo.
  if (!disciplina.responsaveis.some(ehPagavel)) {
    const zerada = await tx.disciplinaEtapa.updateMany({
      where: { id: faseId, liberadaEm: null },
      data: { liberadaEm: agora, valorPagamento: 0, status: "aprovado", entregueEm: agora },
    });
    if (zerada.count === 0) {
      throw new ActionError("A fase mudou enquanto a tela estava aberta — atualize e tente de novo.");
    }
    return { pagaveis: [], salariados: [...disciplina.responsaveis], pool: 0, jaLiberada: false };
  }

  const valorTotal = disciplina.valor ? Number(disciplina.valor) : 0;
  const r = poolsDasFasesPendentes(valorTotal, fases);
  if (!r.ok) throw new ActionError(r.motivo);
  const pool = r.pools.get(faseId) ?? 0;

  // `liberadaEm: null` NA ESCRITA: duas aprovações ao mesmo tempo não liberam a fase duas vezes.
  const marcada = await tx.disciplinaEtapa.updateMany({
    where: { id: faseId, liberadaEm: null },
    data: { liberadaEm: agora, valorPagamento: pool, status: "aprovado", entregueEm: agora },
  });
  if (marcada.count === 0) {
    throw new ActionError("A fase mudou enquanto a tela estava aberta — atualize e tente de novo.");
  }

  const { pagaveis: cotas, salariados } = ratearPagamentoProjetista(disciplina.responsaveis, pool);
  const nome = rotuloDisciplinaPagamento(disciplina.disciplinaTextoLegado, fase.sigla);
  const pagaveis: ResponsavelComUser[] = [];
  for (const { responsavel: resp, valor } of cotas) {
    if (!(valor > 0)) continue;
    const pag = await tx.pagamentoProjetista.create({
      data: {
        disciplinaId: disciplina.id,
        etapaId: faseId,
        projetistaId: resp.userId,
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
      disciplinaNome: nome,
      projetoId: disciplina.projeto.id,
      projetoCodigo: disciplina.projeto.codigo,
      autorId,
      quando: agora,
    });
    await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { lancamentoId } });
    pagaveis.push(resp);
  }
  return { pagaveis, salariados, pool, jaLiberada: false };
}

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

  // F7.4: disciplina com fase, que ainda não pagou inteira, paga POR FASE — aprovar a
  // disciplina libera as fases que faltam, cada uma pelo seu pool (e a última absorve o
  // centavo). Nunca um pagamento "inteiro" por cima de fases (um modo só).
  const fases = await fasesDaDisciplina(tx, disciplina.id);
  if (fases.length > 0) {
    const pagamentos = await tx.pagamentoProjetista.findMany({
      where: { disciplinaId: disciplina.id },
      select: { etapaId: true, status: true },
    });
    if (modoPagamento(pagamentos, fases) !== "disciplina") {
      const semValor = ratearPagamentoProjetista(disciplina.responsaveis, 0);
      // 100% CLT: nada a pagar, nem a repartir — e percentual que não fecha não pode travar
      // uma aprovação que não mexe em dinheiro.
      if (semValor.pagaveis.length === 0) return { pagaveis: [], salariados: semValor.salariados };
      const pendentes = fases
        .filter((f) => f.liberadaEm == null)
        .sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
      const recebem = new Map<string, ResponsavelComUser>();
      let salariados: ResponsavelComUser[] = [];
      for (const f of pendentes) {
        const r = await liberarPagamentosDaFase(tx, { disciplina, faseId: f.id, autorId, agora });
        for (const p of r.pagaveis) recebem.set(p.userId, p);
        salariados = r.salariados;
      }
      return { pagaveis: [...recebem.values()], salariados };
    }
  }

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
export async function sincronizarValorDisciplina(
  tx: Prisma.TransactionClient,
  disciplinaId: string,
  /** F7.4: fase do pagamento ajustado. Nulo/ausente = pagamento da disciplina inteira. */
  etapaId?: string | null,
) {
  if (etapaId) {
    // Pagamento de FASE: o pool dela vira a soma dos vivos dela, e o total da disciplina anda
    // pela mesma diferença (`writeBackFase`). "Pool = soma dos vivos da DISCIPLINA" daria o
    // valor só das fases já liberadas — liberado o Básico, o total cairia para 40%.
    const fase = await tx.disciplinaEtapa.findUnique({ where: { id: etapaId }, select: { valorPagamento: true } });
    const disciplina = await tx.disciplina.findUnique({ where: { id: disciplinaId }, select: { valor: true } });
    const agg = await tx.pagamentoProjetista.aggregate({
      where: { etapaId, status: { not: "cancelado" } },
      _sum: { valor: true },
    });
    const wb = writeBackFase({
      valorDisciplina: disciplina?.valor == null ? 0 : Number(disciplina.valor),
      poolFaseAntes: fase?.valorPagamento == null ? 0 : Number(fase.valorPagamento),
      somaVivosFase: agg._sum.valor == null ? 0 : Number(agg._sum.valor),
    });
    await tx.disciplinaEtapa.update({ where: { id: etapaId }, data: { valorPagamento: wb.poolFase } });
    await tx.disciplina.update({ where: { id: disciplinaId }, data: { valor: wb.valorDisciplina } });
    return;
  }
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
    select: { id: true, projetistaId: true, valor: true, status: true, folhaId: true, lancamentoId: true, etapaId: true },
  });

  // F7.4 — modo FASE: fase liberada está congelada (valor e quem recebe); fase pendente ainda
  // não tem pagamento. Não há o que sincronizar — só o que VALIDAR: mudar o valor alimenta as
  // fases pendentes, então não pode ficar abaixo do liberado, nem mudar quando não sobra fase.
  const fases = await fasesDaDisciplina(tx, disciplina.id);
  if (modoPagamento(existentes, fases) === "fase") {
    const bloqueio = bloqueioValorEmModoFase(disciplina.valor ? Number(disciplina.valor) : 0, fases);
    if (bloqueio) throw new ActionError(bloqueio);
    return { atualizados: 0, cancelados: 0, criados: 0 };
  }

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

  for (const folhaId of lotesTocados) await recalcularTotalFolha(tx, folhaId);

  return {
    atualizados: plano.atualizar.length,
    cancelados: plano.cancelar.length,
    criados: plano.criar.length,
  };
}
