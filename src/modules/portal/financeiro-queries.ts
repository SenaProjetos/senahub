import "server-only";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { SEM_TRANSFERENCIA } from "@/modules/financeiro/natureza";
import { getConfigAvisos } from "@/modules/financeiro/avisos/service";
import { entraNoPortal, financeiroDoCliente, type FinanceiroDoCliente } from "@/modules/portal/financeiro";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Parcelas que o cliente paga ao escritório, para o Financeiro do portal. Escopo ESTRITO pelo cliente
 * da conta: o recebível é dele quando o próprio lançamento aponta para ele, ou quando não aponta para
 * ninguém e o projeto é dele (um recebível de outro pagador no projeto não aparece).
 *
 * Fica de fora: previsão do cronograma (`previsao`, nunca faturada), cancelado, perna de transferência,
 * acessório da baixa (juros/desconto/retenção) e, pela regra da cobrança, licitação. O cliente
 * desativado é barrado pela página antes de chegar aqui.
 */
export async function financeiroDoClienteNoBanco(clienteId: string): Promise<FinanceiroDoCliente> {
  const cfg = await getConfigAvisos();
  const linhas = await prisma.lancamento.findMany({
    where: {
      tipo: "receita",
      status: { in: ["previsto", "confirmado"] },
      transferenciaId: null,
      acessorioDeId: null,
      ...SEM_TRANSFERENCIA,
      OR: [{ clienteId }, { clienteId: null, projeto: { clienteId } }],
    },
    select: {
      id: true,
      status: true,
      valor: true,
      valorEfetivo: true,
      data: true,
      vencimento: true,
      dataConfirmacao: true,
      retencoes: { select: { valor: true } },
      projeto: { select: { codigo: true, nome: true, tipo: true, clienteId: true } },
      categoria: { select: { chave: true, pai: { select: { chave: true, pai: { select: { chave: true } } } } } },
    },
  });

  const recebiveis = linhas
    .filter((l) =>
      entraNoPortal({
        projetoTipo: l.projeto?.tipo,
        chavesDaCategoria: [l.categoria.chave, l.categoria.pai?.chave, l.categoria.pai?.pai?.chave],
        cobrarLicitacao: cfg.cobrarLicitacao,
      }),
    )
    .map((l) => ({
      id: l.id,
      status: l.status as "previsto" | "confirmado",
      valor: l.valor,
      valorEfetivo: l.valorEfetivo,
      data: iso(l.data),
      vencimento: l.vencimento ? iso(l.vencimento) : null,
      dataConfirmacao: l.dataConfirmacao ? iso(l.dataConfirmacao) : null,
      retidoCentavos: l.retencoes.reduce((s, x) => s + paraCentavos(x.valor), 0),
      // Recebível do cliente lançado num projeto de OUTRO cliente: a parcela aparece, o projeto alheio não.
      projeto:
        l.projeto && l.projeto.clienteId === clienteId ? { codigo: l.projeto.codigo, nome: l.projeto.nome } : null,
    }));

  return financeiroDoCliente(recebiveis, diaDeSaoPaulo());
}
