import "server-only";
import { somarMesesUtc } from "@/lib/data";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { brl } from "@/lib/utils";
import { somaPaga } from "@/modules/financeiro/valor-pago";
import { contratosDeCobranca } from "./queries";
import { avisoCobrancaContrato } from "./cobranca-contrato";
import { codigoCategoriaReceita } from "./categoria";
import { TAG_PARCELA_CONTRATO, dividirEmParcelas, ehParcelaGerada, saldoAParcelar } from "./parcelas";

/**
 * Parcelas geradas do projeto: as em aberto (que regenerar e limpar substituem) e o que já entrou
 * por elas. Faturamento por entrega tem a mesma tag e fica de fora (`ehParcelaGerada`).
 */
async function parcelasGeradas(tx: Prisma.TransactionClient, projetoId: string) {
  const linhas = await tx.lancamento.findMany({
    where: {
      projetoId,
      tipo: "receita",
      status: { in: ["previsto", "confirmado"] },
      excluidoEm: null,
      tags: { has: TAG_PARCELA_CONTRATO },
    },
    select: { id: true, status: true, tags: true, valor: true, valorEfetivo: true },
  });
  const geradas = linhas.filter((l) => ehParcelaGerada(l.tags));
  return {
    abertas: geradas.filter((l) => l.status === "previsto").map((l) => l.id),
    recebido: somaPaga(geradas.filter((l) => l.status === "confirmado")),
  };
}

/**
 * Tira as parcelas geradas em aberto: exclusão LÓGICA (some do financeiro, fica no histórico),
 * condicionada a continuarem em aberto — recebida no meio do caminho não sai.
 */
async function excluirParcelasAbertas(tx: Prisma.TransactionClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await tx.lancamento.updateMany({
    where: { id: { in: ids }, status: "previsto", excluidoEm: null },
    data: { excluidoEm: new Date() },
  });
  return r.count;
}

/**
 * Gera N parcelas de recebível (receita PREVISTA) para o que falta receber de `valorTotal` (o total
 * do contrato menos o que já entrou pelas parcelas geradas), vencendo a partir de `dataPrimeira` a
 * cada `intervaloMeses`. Substitui só as parcelas GERADAS em aberto: recebidas e faturamento por
 * entrega ficam (A6). Separado da action para o smoke alcançar a regra sem sessão.
 */
export async function gerarParcelasDoProjeto(p: {
  projetoId: string;
  valorTotal: number;
  numeroParcelas: number;
  dataPrimeira: string;
  intervaloMeses: number;
  autorId: string;
}): Promise<{ parcelas: number; recebido: number }> {
  const projeto = await prisma.projeto.findUnique({
    where: { id: p.projetoId },
    select: { tipo: true, codigo: true, clienteId: true },
  });
  if (!projeto) throw new ActionError("Projeto não encontrado.");

  const aviso = avisoCobrancaContrato(await contratosDeCobranca(p.projetoId));
  if (aviso?.nivel === "recusa") throw new ActionError(aviso.texto);

  const codigoCat = codigoCategoriaReceita(projeto.tipo);
  const categoria = await prisma.categoriaFinanceira.findUnique({ where: { codigo: codigoCat } });
  if (!categoria) throw new ActionError(`Categoria ${codigoCat} ausente no plano de contas.`);

  const base = new Date(p.dataPrimeira);
  if (Number.isNaN(base.getTime())) throw new ActionError("Data inválida.");

  const n = p.numeroParcelas;
  const recebido = await prisma.$transaction(async (tx) => {
    const atuais = await parcelasGeradas(tx, p.projetoId);
    const falta = saldoAParcelar(Math.round(p.valorTotal * 100), Math.round(atuais.recebido * 100));
    if (falta == null) {
      throw new ActionError(
        `Já entrou ${brl(atuais.recebido)} pelas parcelas deste contrato, o total informado: não há o que parcelar.`,
      );
    }
    await excluirParcelasAbertas(tx, atuais.abertas);
    const registros = dividirEmParcelas(falta / 100, n).map((valor, k) => {
      const venc = somarMesesUtc(base, k * p.intervaloMeses);
      return {
        tipo: "receita" as const,
        descricao: `Parcela ${k + 1}/${n} — contrato (${projeto.codigo})`,
        valor,
        status: "previsto" as const,
        data: venc,
        vencimento: venc,
        categoriaId: categoria.id,
        projetoId: p.projetoId,
        // Sem o cliente, o recebível sumia do resumo do cliente e da cobrança.
        clienteId: projeto.clienteId,
        tags: [TAG_PARCELA_CONTRATO],
        autorId: p.autorId,
      };
    });
    await tx.lancamento.createMany({ data: registros });
    return atuais.recebido;
  });
  return { parcelas: n, recebido };
}

/** Remove as parcelas GERADAS ainda em aberto do projeto (exclusão lógica); devolve quantas. */
export async function limparParcelasDoProjeto(projetoId: string): Promise<number> {
  return prisma.$transaction(async (tx) => excluirParcelasAbertas(tx, (await parcelasGeradas(tx, projetoId)).abertas));
}
