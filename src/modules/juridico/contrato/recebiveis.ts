import { ActionError } from "@/lib/action-error";
import { descricaoParcela, gerarParcelas } from "./parcelamento";

/**
 * Recebíveis gerados a partir de um contrato de cliente assinado (Fase G).
 *
 * Recebe o `tx` por parâmetro (sem importar `prisma`), mesmo motivo de
 * `assinatura/service.ts`: as parcelas nascem na MESMA transação da assinatura — contrato marcado
 * como assinado sem os recebíveis correspondentes seria um cronograma financeiro que ninguém sabe
 * que falta.
 */

/** Só o pedaço do Prisma usado aqui — o `tx` real satisfaz este formato. */
export type RecebiveisTx = {
  categoriaFinanceira: {
    findFirst(args: { where: { codigo: string } }): Promise<{ id: string } | null>;
  };
  lancamento: {
    count(args: { where: { contratoId: string } }): Promise<number>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
};

export type EntradaRecebiveis = {
  contratoId: string;
  titulo: string;
  clienteId: string;
  projetoId: string | null;
  valor: number;
  parcelas: number;
  primeiroVencimento: Date;
  /** `Lancamento.autorId` é NOT NULL — quem assinou o contrato responde pelas parcelas. */
  autorId: string;
};

/**
 * Código do plano de contas usado nos recebíveis de contrato: o mesmo "1.01" que
 * `projetos/receita/actions.ts` já usa para receita de projeto particular. Reusar a conta existente
 * mantém o DRE somando no mesmo lugar — criar uma conta nova só para contratos partiria a receita
 * em duas linhas que ninguém pediu.
 */
export const CODIGO_CATEGORIA_RECEITA = "1.01";

/**
 * Gera as parcelas previstas. **Idempotente**: contrato que já tem lançamento não gera de novo.
 *
 * Sem essa guarda, assinar de novo (segundo signatário, ou reassinar uma versão) duplicaria o
 * faturamento inteiro — o tipo de erro que só aparece quando o dinheiro já foi cobrado duas vezes.
 */
export async function gerarRecebiveisDoContrato(
  tx: RecebiveisTx,
  e: EntradaRecebiveis,
): Promise<{ criadas: number }> {
  const jaExistem = await tx.lancamento.count({ where: { contratoId: e.contratoId } });
  if (jaExistem > 0) return { criadas: 0 };

  const categoria = await tx.categoriaFinanceira.findFirst({ where: { codigo: CODIGO_CATEGORIA_RECEITA } });
  if (!categoria) {
    // Mensagem de negócio: quem assinou o contrato precisa saber que o plano de contas não está
    // semeado, não receber um erro de FK.
    throw new ActionError(
      `Plano de contas sem a categoria de receita ${CODIGO_CATEGORIA_RECEITA} — rode o seed antes de gerar o faturamento.`,
    );
  }

  const parcelas = gerarParcelas(e.valor, e.parcelas, e.primeiroVencimento);
  for (const p of parcelas) {
    await tx.lancamento.create({
      data: {
        tipo: "receita",
        descricao: descricaoParcela(e.titulo, p.numero, parcelas.length),
        valor: p.valor,
        status: "previsto",
        // `data` é a competência; para recebível previsto é o próprio vencimento.
        data: p.vencimento,
        vencimento: p.vencimento,
        categoriaId: categoria.id,
        clienteId: e.clienteId,
        projetoId: e.projetoId,
        contratoId: e.contratoId,
        autorId: e.autorId,
      },
    });
  }

  return { criadas: parcelas.length };
}
