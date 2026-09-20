/**
 * Motor de ação em lote — puro (a ação entra por parâmetro), para ser testado sozinho.
 *
 * Decisão do dono (2026-09-20): o lote **repete a ação que já existe, item a item**, em vez de
 * criar uma action nova por operação. Isso mantém a auditoria registrando item a item e deixa a
 * falha parcial visível — 5 de 7 é um resultado legítimo, não um erro de tela. O preço é o número
 * de chamadas, contido pelo teto.
 *
 * Sequencial de propósito: cem chamadas simultâneas afogariam o servidor de dev e embaralhariam a
 * ordem da auditoria. O ganho de paralelizar não paga o risco.
 */

/** Teto de itens por lote (decisão do dono). Acima disso, a barra pede para filtrar melhor. */
export const TETO_LOTE = 100;

export type ResultadoAcao = { ok: boolean; error?: string };

export type FalhaDoLote = { id: string; rotulo: string; motivo: string };

export type RelatorioLote = {
  total: number;
  concluidos: number;
  falhas: FalhaDoLote[];
};

export function acimaDoTeto(quantidade: number): boolean {
  return quantidade > TETO_LOTE;
}

/** Mensagem do teto, para a barra e para quem tentar executar assim mesmo. */
export function motivoAcimaDoTeto(quantidade: number): string {
  return `São ${quantidade} itens selecionados e o limite por vez é ${TETO_LOTE}. Refine o filtro ou faça em partes.`;
}

/**
 * Roda `executar` uma vez por id, em ordem, e devolve o relatório. Nunca lança por causa de um
 * item: erro de um vira linha de falha, e os demais continuam — parar no primeiro deixaria o
 * usuário sem saber o que foi feito e o que não foi.
 */
export async function executarEmLote({
  ids,
  executar,
  rotulo = (id) => id,
  aoProgredir,
}: {
  ids: readonly string[];
  executar: (id: string) => Promise<ResultadoAcao>;
  /** Como nomear o item nas falhas — id não diz nada a quem lê. */
  rotulo?: (id: string) => string;
  aoProgredir?: (feitos: number, total: number) => void;
}): Promise<RelatorioLote> {
  const relatorio: RelatorioLote = { total: ids.length, concluidos: 0, falhas: [] };

  for (const [i, id] of ids.entries()) {
    try {
      const r = await executar(id);
      if (r.ok) relatorio.concluidos++;
      else relatorio.falhas.push({ id, rotulo: rotulo(id), motivo: r.error || "Não foi possível concluir." });
    } catch {
      // Erro inesperado (rede, exceção) não pode derrubar o lote inteiro.
      relatorio.falhas.push({ id, rotulo: rotulo(id), motivo: "Falha inesperada." });
    }
    aoProgredir?.(i + 1, ids.length);
  }

  return relatorio;
}

/**
 * Frase do resultado, em pt-BR. `substantivo` é o par singular/plural do que foi operado
 * ("documento"/"documentos"), e `verbo` o particípio ("excluído"/"excluídos").
 */
export function resumoDoLote(
  r: RelatorioLote,
  substantivo: [string, string],
  verbo: [string, string],
): string {
  const [sing, plur] = substantivo;
  const [feitoSing, feitoPlur] = verbo;
  if (r.falhas.length === 0) {
    return r.concluidos === 1 ? `1 ${sing} ${feitoSing}.` : `${r.concluidos} ${plur} ${feitoPlur}.`;
  }
  if (r.concluidos === 0) {
    return r.total === 1 ? `Não foi possível: 1 ${sing} falhou.` : `Nenhum dos ${r.total} ${plur} pôde ser processado.`;
  }
  return `${r.concluidos} de ${r.total} ${plur} ${feitoPlur}; ${r.falhas.length} ${r.falhas.length === 1 ? "falhou" : "falharam"}.`;
}

/** Sucesso total, para quem decide entre toast de sucesso e relatório de falhas. */
export function loteSemFalhas(r: RelatorioLote): boolean {
  return r.falhas.length === 0;
}
