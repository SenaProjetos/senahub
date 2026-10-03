import "server-only";

/**
 * Comprovante obrigatório na baixa (M10, configurável em Configurações). Vale pra baixa MANUAL — uma
 * (`confirmarLancamento`), em lote (`baixarEmLote`) e pagamentos em lote (`executarPlano`); produtores
 * (folha, projetista, ART, serviço, recorrência, parcelas de documento, distribuição de lucros, compra de
 * cartão) são isentos por origem, mesma regra da alçada (N3) — e a conciliação OFX também fica de fora: o
 * extrato do banco já É o comprovante.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { getConfigFinanceiro } from "@/modules/financeiro/config/queries";
import { faltaComprovante } from "@/modules/financeiro/config/validacao";

type Db = Prisma.TransactionClient | typeof prisma;

/** Recusa (`ActionError`) se a config exige comprovante e algum dos lançamentos não tem nenhum anexo. */
export async function exigirComprovanteSeObrigatorio(db: Db, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const cfg = await getConfigFinanceiro();
  if (!cfg.comprovanteObrigatorioNaBaixa) return;
  const contagem = await db.lancamentoAnexo.groupBy({ by: ["lancamentoId"], where: { lancamentoId: { in: [...ids] } }, _count: { _all: true } });
  const comAnexo = new Set(contagem.map((c) => c.lancamentoId));
  if (ids.some((id) => faltaComprovante(true, comAnexo.has(id) ? 1 : 0))) {
    throw new ActionError(ids.length === 1 ? "Anexe o comprovante antes de dar baixa (exigido em Configurações)." : "Um ou mais lançamentos selecionados não têm comprovante anexado (exigido em Configurações).");
  }
}
