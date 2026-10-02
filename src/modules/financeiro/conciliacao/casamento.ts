/**
 * Casamento de transação do extrato com lançamento (N4 do núcleo do Financeiro). Puro, sem I/O.
 *
 * Antes o OFX confirmava sozinho qualquer lançamento previsto de "mesmo valor ± 5 dias", em QUALQUER
 * conta (e trocava a conta dele), inclusive perna de transferência, comparando em ponto flutuante e
 * pegando o primeiro num empate (A4). Agora:
 *
 * - valor em centavos, sinal pelo tipo (entrada = receita, saída = despesa);
 * - conta compatível: o lançamento sem conta pode casar (ganha a do extrato); com OUTRA conta, nunca;
 * - janela de data contada em dias-calendário (`YYYY-MM-DD`), não em instantes;
 * - automático só com UM candidato previsto, fora de transferência — empate fica para a pessoa;
 * - sugestões manuais (Conciliação) usam a mesma regra com janela maior e ordem por proximidade.
 */

export type CandidatoConciliacao = {
  id: string;
  tipo: "receita" | "despesa";
  valorCentavos: number;
  status: string;
  contaId: string | null;
  transferenciaId: string | null;
  /** Dia de referência `YYYY-MM-DD`: pago → data do pagamento; em aberto → vencimento ?? data. */
  dia: string;
};

export type TransacaoParaCasar = {
  /** Com sinal: positivo = entrada. */
  valorCentavos: number;
  contaId: string;
  dia: string;
};

/** Janela do casamento automático do OFX (dias para mais ou para menos). */
export const JANELA_AUTOMATICA = 5;
/** Janela das sugestões manuais da tela de Conciliação. */
export const JANELA_SUGESTAO = 45;

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

function compativel(t: TransacaoParaCasar, l: CandidatoConciliacao, janela: number): boolean {
  if (l.tipo !== (t.valorCentavos > 0 ? "receita" : "despesa")) return false;
  if (l.valorCentavos !== Math.abs(t.valorCentavos)) return false;
  if (l.contaId != null && l.contaId !== t.contaId) return false;
  return Math.abs(diasEntre(l.dia, t.dia)) <= janela;
}

/**
 * Sugestões para a pessoa escolher: em aberto e pagos ainda sem transação (G1c), mais perto da data
 * primeiro, em aberto antes de pago no empate.
 */
export function sugestoesDaTransacao<C extends CandidatoConciliacao>(
  t: TransacaoParaCasar,
  candidatos: readonly C[],
  janela = JANELA_SUGESTAO,
): C[] {
  return candidatos
    .filter((l) => (l.status === "previsto" || l.status === "confirmado") && compativel(t, l, janela))
    .sort(
      (a, b) =>
        Math.abs(diasEntre(a.dia, t.dia)) - Math.abs(diasEntre(b.dia, t.dia)) ||
        (a.status === b.status ? 0 : a.status === "previsto" ? -1 : 1) ||
        a.id.localeCompare(b.id),
    );
}

/** O lançamento que o OFX pode confirmar sozinho, ou `null` (nenhum ou empate). */
export function casamentoAutomatico(t: TransacaoParaCasar, candidatos: readonly CandidatoConciliacao[]): string | null {
  const aptos = candidatos.filter(
    (l) => l.status === "previsto" && l.transferenciaId == null && compativel(t, l, JANELA_AUTOMATICA),
  );
  return aptos.length === 1 ? aptos[0].id : null;
}

/** O que a conciliação mudou no lançamento, para desconciliar devolver exatamente ao que era. */
export type EstadoAntesDaConciliacao = {
  /** O lançamento nasceu da transação ("Criar lançamento desta transação"). */
  criadoPelaConciliacao: boolean;
  status: string;
  /** `YYYY-MM-DD` ou nulo. */
  dataConfirmacao: string | null;
  contaId: string | null;
  /** Pagamento de produção ligado: situação e data de pagamento antes. */
  pagamento: { status: string; pagoEm: string | null } | null;
};

export type PlanoDesconciliar =
  | { tipo: "so_desligar"; aviso: string | null }
  | { tipo: "restaurar"; estado: EstadoAntesDaConciliacao }
  | { tipo: "excluir" };

/**
 * Desconciliar devolve o lançamento ao estado de antes (N4): o que a conciliação pagou volta a ficar em
 * aberto, o que ela criou sai. Sem foto (conciliação antiga) ou com o lançamento mexido depois, só
 * desliga a transação — como sempre foi. Receita já distribuída também só desliga, com aviso: voltar
 * a em aberto deixaria o reservado das caixinhas sem a receita (estornar desfaz a distribuição).
 */
export function planoDesconciliar(p: {
  antes: EstadoAntesDaConciliacao | null;
  atual: { status: string; dataConfirmacao: string | null; distribuido: boolean };
  diaDaTransacao: string;
}): PlanoDesconciliar {
  const { antes, atual } = p;
  if (!antes) return { tipo: "so_desligar", aviso: null };
  const comoAConciliacaoDeixou = atual.status === "confirmado" && atual.dataConfirmacao === p.diaDaTransacao;
  if (!comoAConciliacaoDeixou) {
    return { tipo: "so_desligar", aviso: "O lançamento mudou depois da conciliação e ficou como está." };
  }
  if (atual.distribuido) {
    return {
      tipo: "so_desligar",
      aviso: "A receita já foi distribuída entre as caixinhas e continua recebida: estorne-a se o recebimento não aconteceu.",
    };
  }
  if (antes.criadoPelaConciliacao) return { tipo: "excluir" };
  if (antes.status === "confirmado") return { tipo: "so_desligar", aviso: null };
  return { tipo: "restaurar", estado: antes };
}
