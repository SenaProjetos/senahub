/**
 * Casar uma cobrança lançada À MÃO com a previsão de recebimento do cronograma (decisão #12) — regra
 * pura, sem I/O.
 *
 * O problema: o contrato por entrega gera uma PREVISÃO por parcela (`Lancamento.status = previsao`), que
 * vira cobrança quando alguém fatura a parcela na tela do contrato. Se o financeiro emite a nota por
 * outro caminho e lança a receita à mão, ficam DUAS linhas para o mesmo dinheiro: a previsão (que o
 * cronograma segue atualizando) e a cobrança real. A projeção de caixa soma as duas.
 *
 * A regra aqui decide se a cobrança nova É aquela parcela. Ela é deliberadamente conservadora, porque o
 * preço do erro é assimétrico: casar errado apaga a previsão de uma parcela que ninguém faturou (dinheiro
 * que desaparece do caixa previsto), enquanto não casar deixa a duplicidade visível na tela, que alguém
 * corrige. Então:
 *
 * 1. **O valor tem de ser exato**, ao centavo. Nada de "perto o suficiente" com dinheiro.
 * 2. **Empate não casa.** Duas parcelas do mesmo valor e mesma distância de data são ambíguas: o sistema
 *    não escolhe por ela, avisa.
 * 3. **Data longe não casa.** Acima de 45 dias de diferença é outra parcela, ou outro acerto.
 */

/** `YYYY-MM-DD`. */
export type Dia = string;

export type PrevisaoCandidata = {
  /** Id do `Lancamento` da previsão. */
  lancamentoId: string;
  /** Id da `ContratoParcelaEntrega`. */
  parcelaId: string;
  descricao: string;
  valor: number;
  /** Vencimento da previsão (a data do marco). `null` = marco sem data. */
  vencimento: Dia | null;
};

export type ResultadoCasamento =
  | { casou: true; candidata: PrevisaoCandidata }
  | { casou: false; motivo: "sem_previsao" | "valor_diferente" | "data_longe" | "ambigua" };

/** Acima disto, a cobrança é de outra parcela (ou outro acerto) — não se casa por proximidade vaga. */
const JANELA_DIAS = 45;

const centavos = (v: number) => Math.round(v * 100);
const emDias = (a: Dia, b: Dia) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * Qual previsão esta cobrança manual quita — ou por que nenhuma.
 *
 * `vencimento` da cobrança é o que a pessoa digitou (ou a data dela, quando não há vencimento).
 * Previsão sem data (marco sem data) entra na disputa por valor, e só perde de uma que tenha data mais
 * próxima.
 */
export function casarComPrevisao(
  candidatas: readonly PrevisaoCandidata[],
  cobranca: { valor: number; vencimento: Dia },
): ResultadoCasamento {
  if (candidatas.length === 0) return { casou: false, motivo: "sem_previsao" };

  const mesmoValor = candidatas.filter((c) => centavos(c.valor) === centavos(cobranca.valor));
  if (mesmoValor.length === 0) return { casou: false, motivo: "valor_diferente" };
  if (mesmoValor.length === 1) {
    const unica = mesmoValor[0];
    if (unica.vencimento && emDias(unica.vencimento, cobranca.vencimento) > JANELA_DIAS) {
      return { casou: false, motivo: "data_longe" };
    }
    return { casou: true, candidata: unica };
  }

  // Várias do mesmo valor: decide a distância de data. Sem data conta como distância máxima, para
  // perder de qualquer previsão datada dentro da janela.
  const comDistancia = mesmoValor.map((c) => ({
    c,
    d: c.vencimento ? emDias(c.vencimento, cobranca.vencimento) : Number.POSITIVE_INFINITY,
  }));
  const menor = Math.min(...comDistancia.map((x) => x.d));
  if (!Number.isFinite(menor)) return { casou: false, motivo: "ambigua" };
  if (menor > JANELA_DIAS) return { casou: false, motivo: "data_longe" };
  const vencedoras = comDistancia.filter((x) => x.d === menor);
  if (vencedoras.length > 1) return { casou: false, motivo: "ambigua" };
  return { casou: true, candidata: vencedoras[0].c };
}

/** Por que não casou, em uma frase para a tela. `null` quando casou (a tela diz com o quê). */
export function motivoDoNaoCasamento(r: ResultadoCasamento): string | null {
  if (r.casou) return null;
  switch (r.motivo) {
    case "sem_previsao":
      return null; // projeto sem previsão do cronograma: não há o que avisar
    case "valor_diferente":
      return "Este projeto tem previsão de recebimento do cronograma, mas nenhuma com este valor exato — confira se a cobrança substitui uma parcela (e fature a parcela no contrato, se for o caso).";
    case "data_longe":
      return "Há previsão com este valor, mas com vencimento muito distante — não foi casada. Se a cobrança é dessa parcela, fature-a na tela do contrato.";
    case "ambigua":
      return "Há mais de uma previsão com este valor e não foi possível saber qual — fature a parcela certa na tela do contrato.";
  }
}
