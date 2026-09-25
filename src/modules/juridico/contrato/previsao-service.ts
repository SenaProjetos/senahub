import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { paraDataUtc, planoDoProjeto } from "@/modules/planejamento/agenda";
import { CODIGO_CATEGORIA_RECEITA } from "./recebiveis";
import {
  motivoNaoFatura,
  ordenarParcelas,
  descricaoParcelaEntrega,
  planejarPrevisoes,
  valoresDasParcelas,
  type ParcelaEntregaEstado,
} from "./parcelas-entrega";

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Sincroniza as PREVISÕES de recebimento (F7.2 — D25) dos contratos por entrega de um projeto:
 * uma linha `previsao` por parcela ainda não faturada, com a data do marco no cronograma aprovado
 * (ou a da assinatura, para a parcela sem marco). Regras em `parcelas-entrega.ts`.
 *
 * Chamada depois de tudo que muda uma data de marco ou o plano: mudança na EAP (`aposMudarEap`),
 * aprovação do cronograma, assinatura do contrato e edição das parcelas. Idempotente — sem nada a
 * mudar, não escreve nada. Só toca linha `previsao`: parcela faturada é do financeiro.
 *
 * Barata quando não há o que fazer: sem contrato por entrega no projeto, não roda o motor.
 */
export function sincronizarPrevisoesDoProjeto(projetoId: string, autorId: string) {
  return sincronizarPrevisoes({ projetoId }, autorId);
}

/** Contrato SEM projeto: só a parcela "na assinatura" tem data (não há marco possível). */
export function sincronizarPrevisoesDoContrato(contratoId: string, autorId: string) {
  return sincronizarPrevisoes({ contratoId }, autorId);
}

async function sincronizarPrevisoes(
  alvo: { projetoId: string } | { contratoId: string },
  autorId: string,
): Promise<{ criadas: number; atualizadas: number; removidas: number }> {
  const contratos = await prisma.documentoJuridico.findMany({
    where: {
      ...("projetoId" in alvo ? { projetoId: alvo.projetoId } : { id: alvo.contratoId }),
      vinculoId: null,
      clienteId: { not: null },
      // Os por entrega — e qualquer um que ainda tenha previsão pendurada (trocou para por data).
      OR: [{ formaCobranca: "por_entrega" }, { parcelasEntrega: { some: { lancamento: { status: "previsao" } } } }],
    },
    select: {
      id: true,
      projetoId: true,
      titulo: true,
      formaCobranca: true,
      statusContrato: true,
      valor: true,
      clienteId: true,
      assinadoEm: true,
      parcelasEntrega: {
        select: {
          id: true,
          descricao: true,
          percentual: true,
          ordem: true,
          naAssinatura: true,
          marcoId: true,
          lancamento: {
            select: { id: true, status: true, valor: true, vencimento: true, descricao: true, excluidoEm: true },
          },
        },
      },
    },
  });
  const zero = { criadas: 0, atualizadas: 0, removidas: 0 };
  if (contratos.length === 0) return zero;

  // Cronograma e datas de marco por projeto — só roda o motor de quem tem parcela de marco.
  const porProjeto = new Map<string, { aprovado: boolean; dataDoMarco: Map<string, string> }>();
  for (const projetoId of new Set(contratos.map((c) => c.projetoId).filter((p): p is string => p != null))) {
    const precisaDoMotor = contratos.some((c) => c.projetoId === projetoId && c.parcelasEntrega.some((x) => x.marcoId != null));
    const [cronograma, plano] = await Promise.all([
      prisma.cronogramaProjeto.findUnique({ where: { projetoId }, select: { aprovado: true } }),
      precisaDoMotor ? planoDoProjeto(projetoId) : Promise.resolve(null),
    ]);
    const dataDoMarco = new Map<string, string>();
    for (const [id, linha] of plano?.resultado.linhas ?? []) dataDoMarco.set(id, linha.fim);
    porProjeto.set(projetoId, { aprovado: cronograma?.aprovado ?? false, dataDoMarco });
  }
  const semProjeto = { aprovado: false, dataDoMarco: new Map<string, string>() };

  let categoriaId: string | null | undefined;
  const r = { ...zero };
  for (const c of contratos) {
    const proj = (c.projetoId ? porProjeto.get(c.projetoId) : undefined) ?? semProjeto;
    const parcelas: ParcelaEntregaEstado[] = c.parcelasEntrega.map((p) => ({
      id: p.id,
      descricao: p.descricao,
      percentual: Number(p.percentual),
      ordem: p.ordem,
      naAssinatura: p.naAssinatura,
      marcoId: p.marcoId,
      // Linha excluída no financeiro conta como inexistente: a previsão volta a nascer.
      lancamento:
        p.lancamento && !p.lancamento.excluidoEm
          ? {
              id: p.lancamento.id,
              status: p.lancamento.status,
              valor: Number(p.lancamento.valor),
              vencimento: dia(p.lancamento.vencimento),
              descricao: p.lancamento.descricao,
            }
          : null,
    }));
    const plan = planejarPrevisoes({
      contrato: {
        titulo: c.titulo,
        formaCobranca: c.formaCobranca,
        statusContrato: c.statusContrato,
        valor: c.valor == null ? null : Number(c.valor),
        assinadoEm: dia(c.assinadoEm),
      },
      cronogramaAprovado: proj.aprovado,
      parcelas,
      dataDoMarco: proj.dataDoMarco,
    });
    if (plan.criar.length === 0 && plan.atualizar.length === 0 && plan.remover.length === 0) continue;

    if (plan.criar.length > 0 && categoriaId === undefined) {
      categoriaId =
        (await prisma.categoriaFinanceira.findFirst({ where: { codigo: CODIGO_CATEGORIA_RECEITA }, select: { id: true } }))
          ?.id ?? null;
    }
    if (plan.criar.length > 0 && !categoriaId) {
      throw new ActionError(
        `Plano de contas sem a categoria de receita ${CODIGO_CATEGORIA_RECEITA} — rode o seed antes de prever recebimentos.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const d of plan.criar) {
        const venc = paraDataUtc(d.vencimento);
        const l = await tx.lancamento.create({
          data: {
            tipo: "receita",
            status: "previsao",
            descricao: d.descricao,
            valor: d.valor,
            data: venc,
            vencimento: venc,
            categoriaId: categoriaId!,
            clienteId: c.clienteId,
            projetoId: c.projetoId,
            contratoId: c.id,
            autorId,
          },
          select: { id: true },
        });
        // Só liga se a parcela ainda estiver livre: duas sincronizações ao mesmo tempo não podem
        // deixar uma previsão órfã somando no caixa em dobro.
        const ligada = await tx.contratoParcelaEntrega.updateMany({
          where: { id: d.parcelaId, OR: [{ lancamentoId: null }, { lancamento: { excluidoEm: { not: null } } }] },
          data: { lancamentoId: l.id },
        });
        if (ligada.count === 0) await tx.lancamento.delete({ where: { id: l.id } });
        else r.criadas++;
      }
      for (const a of plan.atualizar) {
        const venc = paraDataUtc(a.vencimento);
        const u = await tx.lancamento.updateMany({
          where: { id: a.lancamentoId, status: "previsao" },
          data: { valor: a.valor, vencimento: venc, data: venc, descricao: a.descricao },
        });
        r.atualizadas += u.count;
      }
      for (const x of plan.remover) {
        await tx.contratoParcelaEntrega.updateMany({
          where: { id: x.parcelaId, lancamentoId: x.lancamentoId },
          data: { lancamentoId: null },
        });
        const d = await tx.lancamento.deleteMany({ where: { id: x.lancamentoId, status: "previsao" } });
        r.removidas += d.count;
      }
    });
  }
  return r;
}

/**
 * Fatura uma parcela de contrato por entrega (F7.2 — D9): a previsão vira conta a receber
 * (`previsto`) na MESMA linha, com o vencimento escolhido; sem previsão, cria a conta a receber.
 * O valor sai da mesma regra da previsão (`valoresDasParcelas`). Separado da action para o smoke
 * alcançar a regra sem sessão.
 */
export async function faturarParcela(p: {
  parcelaId: string;
  /** `YYYY-MM-DD`. */
  vencimento: string;
  autorId: string;
}): Promise<{ parcelaId: string; valor: number; lancamentoId: string }> {
  const parcela = await prisma.contratoParcelaEntrega.findUnique({
    where: { id: p.parcelaId },
    select: {
      id: true,
      lancamento: { select: { id: true, status: true, excluidoEm: true } },
      contrato: {
        select: {
          id: true,
          titulo: true,
          valor: true,
          clienteId: true,
          projetoId: true,
          formaCobranca: true,
          statusContrato: true,
          parcelasEntrega: { select: { id: true, descricao: true, percentual: true, ordem: true } },
        },
      },
    },
  });
  if (!parcela) throw new ActionError("Parcela não encontrada.");
  const c = parcela.contrato;
  if (c.formaCobranca !== "por_entrega") throw new ActionError("Este contrato é cobrado por data.");
  if (c.statusContrato !== "assinado" && c.statusContrato !== "vencido") {
    throw new ActionError("Contrato ainda não assinado — não há o que faturar.");
  }
  const lancamento = parcela.lancamento && !parcela.lancamento.excluidoEm ? parcela.lancamento : null;
  const bloqueio = motivoNaoFatura({ lancamento });
  if (bloqueio) throw new ActionError(bloqueio);

  const ordenadas = ordenarParcelas(c.parcelasEntrega.map((x) => ({ ...x, percentual: Number(x.percentual) })));
  const v = valoresDasParcelas(c.valor == null ? null : Number(c.valor), ordenadas);
  if (!v.ok) throw new ActionError(`${v.motivo} Ajuste o plano do contrato antes de faturar.`);
  const idx = ordenadas.findIndex((x) => x.id === parcela.id);
  const valor = v.valores[idx];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)) throw new ActionError("Vencimento inválido.");
  const venc = paraDataUtc(p.vencimento);
  if (Number.isNaN(venc.getTime())) throw new ActionError("Vencimento inválido.");
  const descricao = descricaoParcelaEntrega(c.titulo, idx + 1, ordenadas.length, ordenadas[idx].descricao);

  const lancamentoId = await prisma.$transaction(async (tx) => {
    if (lancamento?.status === "previsao") {
      // Converte a previsão EM cobrança, na mesma linha — nunca as duas somando no caixa.
      const u = await tx.lancamento.updateMany({
        where: { id: lancamento.id, status: "previsao" },
        data: { status: "previsto", valor, vencimento: venc, data: venc, descricao },
      });
      if (u.count === 0) throw new ActionError("A parcela mudou enquanto a tela estava aberta — atualize e tente de novo.");
      return lancamento.id;
    }
    const categoria = await tx.categoriaFinanceira.findFirst({ where: { codigo: CODIGO_CATEGORIA_RECEITA }, select: { id: true } });
    if (!categoria) {
      throw new ActionError(`Plano de contas sem a categoria de receita ${CODIGO_CATEGORIA_RECEITA} — rode o seed.`);
    }
    const novo = await tx.lancamento.create({
      data: {
        tipo: "receita",
        status: "previsto",
        descricao,
        valor,
        data: venc,
        vencimento: venc,
        categoriaId: categoria.id,
        clienteId: c.clienteId,
        projetoId: c.projetoId,
        contratoId: c.id,
        autorId: p.autorId,
      },
      select: { id: true },
    });
    await tx.contratoParcelaEntrega.update({ where: { id: parcela.id }, data: { lancamentoId: novo.id } });
    return novo.id;
  });
  return { parcelaId: parcela.id, valor, lancamentoId };
}
