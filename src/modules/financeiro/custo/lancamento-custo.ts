import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { brl } from "@/lib/utils";
import { lancamentosDaTaxaArt, rotuloArt } from "@/modules/projetos/art/service";

/**
 * Ponte custo → financeiro. Centraliza a criação/sincronização de Lançamentos de
 * despesa a partir de pagamentos de projetista e serviços terceirizados, para que
 * o custo comprometido apareça no financeiro/DRE/fluxo e na margem do projeto.
 *
 * Funções recebem o `tx` da transação chamadora — nunca abrem transação própria.
 */

/** Código do plano de contas (PLANO_CONTAS na seed) por tipo de profissional. */
export const CATEGORIA_POR_TIPO: Record<string, string> = {
  projetista_pj: "2.01",
  freelancer: "2.02",
  clt: "2.03",
  estagiario: "2.04",
};

/** Fornecedores externos / serviços terceirizados. */
export const CATEGORIA_TERCEIRIZADO = "2.05";

/** Taxas de conselho (ART/RRT/TRT) pagas pela empresa. */
export const CATEGORIA_TAXA_ART = "2.09";

/** Receita de reembolso de taxa de ART cobrada do cliente ("Outras receitas"). */
export const CATEGORIA_REEMBOLSO_ART = "1.03";

/**
 * Marca a receita de reembolso de ART. Na margem do projeto ela abate o custo da taxa em vez de
 * contar como receita (senão infla a base da margem %). Nunca usar `TAG_PARCELA_CONTRATO` aqui:
 * a regeração de parcelas apaga as receitas previstas com aquela tag.
 */
export const TAG_REEMBOLSO_ART = "reembolso-art";

async function categoriaIdPorCodigo(tx: Prisma.TransactionClient, codigo: string): Promise<string> {
  const c = await tx.categoriaFinanceira.findUnique({ where: { codigo }, select: { id: true } });
  if (!c) throw new ActionError(`Categoria ${codigo} ausente no plano de contas. Rode npm run db:seed.`);
  return c.id;
}

/**
 * Cria a despesa PREVISTA de um pagamento de projetista liberado e devolve o id
 * do lançamento (para gravar em PagamentoProjetista.lancamentoId).
 */
export async function criarDespesaProjetistaPrevista(
  tx: Prisma.TransactionClient,
  p: {
    pagamentoId: string;
    valor: Prisma.Decimal | number;
    tipoProfissional: string;
    projetistaNome: string;
    disciplinaNome: string;
    projetoId: string;
    projetoCodigo: string;
    autorId: string;
    quando: Date;
  },
): Promise<string> {
  const categoriaId = await categoriaIdPorCodigo(
    tx,
    CATEGORIA_POR_TIPO[p.tipoProfissional] ?? CATEGORIA_POR_TIPO.projetista_pj,
  );
  const lanc = await tx.lancamento.create({
    data: {
      tipo: "despesa",
      descricao: `Projetista ${p.projetistaNome} — ${p.disciplinaNome} (${formatarCodigo(p.projetoCodigo)})`,
      valor: p.valor,
      status: "previsto",
      data: p.quando,
      vencimento: p.quando,
      categoriaId,
      projetoId: p.projetoId,
      pagamentoProjetistaId: p.pagamentoId,
      autorId: p.autorId,
    },
  });
  return lanc.id;
}

/**
 * Confirma a despesa de um pagamento de projetista: confirma o lançamento previsto
 * existente (criado na validação) ou, em dado legado sem previsto, cria já confirmado.
 * Devolve o lancamentoId. Compartilhado por pagarProjetista (individual) e pagarFolha (lote).
 */
export async function confirmarDespesaProjetista(
  tx: Prisma.TransactionClient,
  pag: {
    id: string;
    lancamentoId: string | null;
    valor: Prisma.Decimal | number;
    tipoProfissional: string;
    projetistaNome: string;
    disciplinaNome: string;
    projetoId: string;
    projetoCodigo: string;
  },
  opts: { contaId: string | null; formaId: string | null; quando: Date; autorId: string },
): Promise<string> {
  const previsto = pag.lancamentoId
    ? await tx.lancamento.findUnique({ where: { id: pag.lancamentoId } })
    : await tx.lancamento.findUnique({ where: { pagamentoProjetistaId: pag.id } });

  if (previsto && previsto.status !== "cancelado") {
    await tx.lancamento.update({
      where: { id: previsto.id },
      data: {
        status: "confirmado",
        dataConfirmacao: opts.quando,
        contaId: opts.contaId || previsto.contaId,
        formaId: opts.formaId || previsto.formaId,
      },
    });
    return previsto.id;
  }

  const codigo = CATEGORIA_POR_TIPO[pag.tipoProfissional] ?? CATEGORIA_POR_TIPO.projetista_pj;
  const categoria = await tx.categoriaFinanceira.findUnique({ where: { codigo } });
  if (!categoria) throw new ActionError(`Categoria ${codigo} ausente no plano de contas.`);
  const lanc = await tx.lancamento.create({
    data: {
      tipo: "despesa",
      descricao: `Projetista ${pag.projetistaNome} — ${pag.disciplinaNome} (${formatarCodigo(pag.projetoCodigo)})`,
      valor: pag.valor,
      status: "confirmado",
      data: opts.quando,
      dataConfirmacao: opts.quando,
      categoriaId: categoria.id,
      contaId: opts.contaId,
      formaId: opts.formaId,
      projetoId: pag.projetoId,
      pagamentoProjetistaId: pag.id,
      autorId: opts.autorId,
    },
  });
  return lanc.id;
}

/** Status financeiro derivado do status do serviço terceirizado. null = não deve haver lançamento. */
export function statusLancamentoServico(status: string): "previsto" | "confirmado" | null {
  if (status === "contratado") return "previsto";
  if (status === "concluido") return "confirmado";
  return null; // cancelado
}

/**
 * Sincroniza o lançamento de um serviço terceirizado com seu status/valor (idempotente):
 * contratado → despesa prevista · concluído → confirmada · cancelado/sem valor → cancela o existente.
 * Devolve o lancamentoId atual (ou null se não deve existir).
 */
export async function sincronizarDespesaServico(
  tx: Prisma.TransactionClient,
  s: {
    servicoLancamentoId: string | null;
    valor: Prisma.Decimal | number | null;
    status: string;
    fornecedorId: string | null;
    descricao: string;
    projetoId: string;
    projetoCodigo: string;
    autorId: string;
  },
): Promise<string | null> {
  const alvo = statusLancamentoServico(s.status);
  const temValor = s.valor != null && Number(s.valor) > 0;
  const deveTer = alvo != null && temValor;

  // Não deve haver lançamento (cancelado ou sem valor) → cancela o existente.
  if (!deveTer) {
    if (s.servicoLancamentoId) {
      await tx.lancamento.updateMany({
        where: { id: s.servicoLancamentoId, status: { not: "cancelado" } },
        data: { status: "cancelado" },
      });
    }
    return null;
  }

  const quando = new Date();
  const comuns = {
    descricao: `Serviço terceirizado — ${s.descricao} (${formatarCodigo(s.projetoCodigo)})`,
    valor: s.valor!,
    fornecedorId: s.fornecedorId,
  };

  if (s.servicoLancamentoId) {
    await tx.lancamento.update({
      where: { id: s.servicoLancamentoId },
      data: {
        ...comuns,
        status: alvo,
        dataConfirmacao: alvo === "confirmado" ? quando : null,
      },
    });
    return s.servicoLancamentoId;
  }

  const categoriaId = await categoriaIdPorCodigo(tx, CATEGORIA_TERCEIRIZADO);
  const lanc = await tx.lancamento.create({
    data: {
      tipo: "despesa",
      ...comuns,
      status: alvo,
      data: quando,
      vencimento: alvo === "previsto" ? quando : null,
      dataConfirmacao: alvo === "confirmado" ? quando : null,
      categoriaId,
      projetoId: s.projetoId,
      autorId: s.autorId,
    },
  });
  return lanc.id;
}

type SlotArt = {
  /** Id gravado na ART (pode apontar para lançamento já cancelado). */
  atualId: string | null;
  deveTer: boolean;
  tipo: "despesa" | "receita";
  categoriaCodigo: string;
  descricao: string;
  valor: number;
  quando: Date;
  projetoId: string;
  clienteId: string | null;
  tags: string[];
  autorId: string;
  /** Início da mensagem de erro: "O pagamento da taxa", "O reembolso da taxa". */
  rotulo: string;
};

/**
 * Um lançamento vinculado à ART (despesa ou reembolso). Só mexe em lançamento `previsto`:
 * a ART não sabe se a taxa foi paga — isso acontece no Financeiro, ao baixar o lançamento.
 * Lançamento já baixado nunca é reescrito nem cancelado por aqui (o dinheiro já se moveu).
 */
async function sincronizarSlotArt(tx: Prisma.TransactionClient, s: SlotArt): Promise<string | null> {
  const atual = s.atualId
    ? await tx.lancamento.findUnique({ where: { id: s.atualId }, select: { id: true, status: true, valor: true } })
    : null;
  const vivo = atual && atual.status !== "cancelado" ? atual : null;
  const baixado = vivo?.status === "confirmado";

  if (!s.deveTer) {
    if (!vivo) return null;
    if (baixado) return vivo.id;
    await tx.lancamento.update({ where: { id: vivo.id }, data: { status: "cancelado" } });
    return null;
  }

  if (vivo && baixado) {
    if (Math.round(Number(vivo.valor) * 100) !== Math.round(s.valor * 100)) {
      throw new ActionError(
        `${s.rotulo} desta ART já foi baixado no Financeiro por ${brl(Number(vivo.valor))} — o valor da ART precisa continuar igual ao baixado.`,
      );
    }
    return vivo.id;
  }

  const comuns = {
    descricao: s.descricao,
    valor: s.valor,
    data: s.quando,
    vencimento: s.quando,
    clienteId: s.clienteId,
  };
  if (vivo) {
    await tx.lancamento.update({ where: { id: vivo.id }, data: comuns });
    return vivo.id;
  }

  const categoriaId = await categoriaIdPorCodigo(tx, s.categoriaCodigo);
  const lanc = await tx.lancamento.create({
    data: {
      ...comuns,
      tipo: s.tipo,
      status: "previsto",
      categoriaId,
      projetoId: s.projetoId,
      tags: s.tags,
      autorId: s.autorId,
    },
  });
  return lanc.id;
}

/**
 * Espelha a taxa de uma ART no Financeiro (idempotente): despesa prevista quando a empresa
 * paga, mais a receita prevista do reembolso quando o cliente reembolsa. Chamar depois de
 * gravar a ART, dentro da mesma transação, e persistir os ids devolvidos na ART.
 */
export async function sincronizarLancamentosArt(
  tx: Prisma.TransactionClient,
  art: {
    tipo: string;
    numero: string;
    situacao: string;
    custeio: string;
    valor: Prisma.Decimal | number | null;
    emitidaEm: Date | null;
    lancamentoId: string | null;
    reembolsoLancamentoId: string | null;
    disciplinaNome: string | null;
    projetoId: string;
    projetoCodigo: string;
    clienteId: string | null;
    autorId: string;
  },
): Promise<{ lancamentoId: string | null; reembolsoLancamentoId: string | null }> {
  const valor = art.valor != null ? Number(art.valor) : null;
  const deve = lancamentosDaTaxaArt({ situacao: art.situacao, custeio: art.custeio, valor });
  const rotulo = rotuloArt(art);
  const codigo = formatarCodigo(art.projetoCodigo);
  const quando = art.emitidaEm ?? new Date();
  const comum = { valor: valor ?? 0, quando, projetoId: art.projetoId, autorId: art.autorId };

  const lancamentoId = await sincronizarSlotArt(tx, {
    ...comum,
    atualId: art.lancamentoId,
    deveTer: deve.despesa,
    tipo: "despesa",
    categoriaCodigo: CATEGORIA_TAXA_ART,
    descricao: `Taxa ${rotulo} — ${art.disciplinaNome ?? "projeto"} (${codigo})`,
    clienteId: null,
    tags: [],
    rotulo: "O pagamento da taxa",
  });
  const reembolsoLancamentoId = await sincronizarSlotArt(tx, {
    ...comum,
    atualId: art.reembolsoLancamentoId,
    deveTer: deve.reembolso,
    tipo: "receita",
    categoriaCodigo: CATEGORIA_REEMBOLSO_ART,
    descricao: `Reembolso da taxa ${rotulo} (${codigo})`,
    clienteId: art.clienteId,
    tags: [TAG_REEMBOLSO_ART],
    rotulo: "O reembolso da taxa",
  });
  return { lancamentoId, reembolsoLancamentoId };
}
