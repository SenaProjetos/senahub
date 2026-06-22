import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { formatarCodigo } from "@/modules/projetos/numbering";

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
