/**
 * Plano de sincronização dos pagamentos de uma disciplina quando valor ou responsáveis
 * mudam DEPOIS da liberação. Puro (sem Prisma/IO) — a aplicação fica em
 * `sincronizarPagamentosDisciplina` (`pagamento.ts`).
 *
 * Regras (decididas em 2026-08-12):
 * - pagamento já `pago` congela a disciplina: dinheiro que saiu não se reescreve daqui.
 * - valor zerado/limpo CANCELA o pendente em vez de gravar R$ 0,00 — gravar zero
 *   recriaria exatamente a linha morta na folha que originou este trabalho.
 * - responsável removido tem o pendente cancelado; adicionado ganha pagamento novo.
 * - `cancelado` é história: não casa com ninguém, e um responsável que volta recebe
 *   uma linha nova em vez de reviver a antiga.
 */

/** Pagamento já existente da disciplina, como está no banco. */
export type PagamentoAtual = {
  id: string;
  projetistaId: string;
  valor: number;
  status: "pendente" | "pago" | "cancelado";
};

/** Cota calculada pelo rateio, já resolvida para um responsável pagável. */
export type CotaAlvo = { userId: string; valor: number };

export type PlanoSincronizacao = {
  atualizar: { pagamentoId: string; valor: number }[];
  cancelar: { pagamentoId: string }[];
  criar: { userId: string; valor: number }[];
};

export const PLANO_VAZIO: PlanoSincronizacao = { atualizar: [], cancelar: [], criar: [] };

/**
 * Mensagem de recusa quando a disciplina tem pagamento efetivado, ou `null` se pode
 * sincronizar. Cobre tanto mudar o valor quanto remover um responsável já pago — nos
 * dois casos o dinheiro já saiu e a linha virou história.
 */
export function bloqueioSincronizacao(atuais: PagamentoAtual[]): string | null {
  if (!atuais.some((p) => p.status === "pago")) return null;
  return "Esta disciplina já tem pagamento efetivado — o valor e os responsáveis não podem mais ser alterados por aqui.";
}

/**
 * Monta o plano comparando o que existe com o que o rateio diz que deveria existir.
 * Disciplina sem nenhum pagamento (nunca concluída) devolve plano vazio — o pagamento
 * só nasce na aprovação, e sincronizar antes disso criaria pagamento do nada.
 */
export function planejarSincronizacao(
  atuais: PagamentoAtual[],
  cotas: CotaAlvo[],
): PlanoSincronizacao {
  if (atuais.length === 0) return PLANO_VAZIO;

  // Cota de valor zero não é alvo: vira cancelamento, nunca um pendente de R$ 0,00.
  const alvos = new Map(cotas.filter((c) => c.valor > 0).map((c) => [c.userId, c.valor]));
  const vivos = atuais.filter((p) => p.status === "pendente");

  const atualizar: PlanoSincronizacao["atualizar"] = [];
  const cancelar: PlanoSincronizacao["cancelar"] = [];

  for (const p of vivos) {
    const alvo = alvos.get(p.projetistaId);
    if (alvo == null) cancelar.push({ pagamentoId: p.id });
    else if (alvo !== p.valor) atualizar.push({ pagamentoId: p.id, valor: alvo });
  }

  const jaTem = new Set(vivos.map((p) => p.projetistaId));
  const criar = [...alvos.entries()]
    .filter(([userId]) => !jaTem.has(userId))
    .map(([userId, valor]) => ({ userId, valor }));

  return { atualizar, cancelar, criar };
}

/** `true` se o plano não muda nada — evita abrir transação/recalcular lote à toa. */
export function planoVazio(p: PlanoSincronizacao): boolean {
  return p.atualizar.length === 0 && p.cancelar.length === 0 && p.criar.length === 0;
}
