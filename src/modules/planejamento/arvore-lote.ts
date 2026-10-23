/**
 * Árvore da EAP em LOTE — PURO. Recuar, avançar, mover e excluir várias linhas de uma vez, como no MS Project.
 *
 * Valem as regras de `arvore-eap.ts` linha a linha, com três cuidados que só aparecem com várias linhas:
 * - quem está dentro de uma linha selecionada vai com ela (`raizesDaSelecao`): recuar um agrupamento e as filhas dele
 *   não recua as filhas duas vezes;
 * - o recuo em lote NÃO é a aplicação sequencial de `planoDeRecuo`: recuar Y, Z em sequência faria Z virar filha de Y
 *   (que acabou de recuar). No Project o resultado é Y e Z irmãs sob a linha que estava acima de Y — por isso o novo pai
 *   de cada uma é a irmã de cima que NÃO está selecionada, lida na árvore de antes;
 * - é tudo ou nada: se UMA linha não pode, o lote inteiro é recusado e a frase diz qual (`linhaId`).
 */
import {
  MOTIVO_IRMA_E_MARCO,
  MOTIVO_NIVEL_MAIS_ALTO,
  MOTIVO_PRIMEIRA_DO_NIVEL,
  MOTIVO_SEM_IRMA_ACIMA,
  MOTIVO_ULTIMA_DO_NIVEL,
  irmaVizinha,
  irmaosDe,
  paiDe,
  type NoArvore,
} from "./arvore-eap";

/** Linhas por lote (selecionar, colar, copiar): o servidor recusa acima disso. */
export const MAX_LINHAS_LOTE = 200;

const MOTIVO_NENHUMA_LINHA = "Escolha ao menos uma linha.";

/** As linhas em ordem de documento: profundidade, irmãs por `ordem` (empate pelo `id`) — a ordem que a tela mostra. */
export function ordemDeDocumento(nos: readonly NoArvore[]): string[] {
  const ids = new Set(nos.map((n) => n.id));
  const saida: string[] = [];
  const visitados = new Set<string>();
  const descer = (pai: string | null) => {
    for (const n of irmaosDe(nos, pai)) {
      if (visitados.has(n.id)) continue; // ciclo de `parentId`: não repete nem trava
      visitados.add(n.id);
      saida.push(n.id);
      descer(n.id);
    }
  };
  descer(null);
  // Linha órfã ou presa num ciclo não aparece na descida: entra no fim, para nunca sumir da conta.
  for (const n of nos) if (ids.has(n.id) && !visitados.has(n.id)) saida.push(n.id);
  return saida;
}

/** As linhas escolhidas que não estão dentro de outra escolhida, em ordem de documento. Id desconhecido é ignorado. */
export function raizesDaSelecao(nos: readonly NoArvore[], ids: readonly string[]): string[] {
  const escolhidas = new Set(ids);
  const porId = new Map(nos.map((n) => [n.id, n]));
  const todos = new Set(nos.map((n) => n.id));
  const temAncestralEscolhido = (id: string): boolean => {
    const vistos = new Set<string>([id]);
    for (let p = paiDe(porId.get(id)!, todos); p && !vistos.has(p); p = paiDe(porId.get(p)!, todos)) {
      if (escolhidas.has(p)) return true;
      vistos.add(p);
    }
    return false;
  };
  return ordemDeDocumento(nos).filter((id) => escolhidas.has(id) && !temAncestralEscolhido(id));
}

export type RecuoEmLote =
  | { ok: true; movimentos: { id: string; novoPaiId: string }[] }
  | { ok: false; motivo: string; linhaId?: string };

/** Recuar várias: cada raiz da seleção vira filha da irmã imediatamente acima que não está selecionada. */
export function planoDeRecuoEmLote(nos: readonly NoArvore[], ids: readonly string[]): RecuoEmLote {
  const raizes = raizesDaSelecao(nos, ids);
  if (raizes.length === 0) return { ok: false, motivo: MOTIVO_NENHUMA_LINHA };
  const escolhidas = new Set(raizes);
  const porId = new Map(nos.map((n) => [n.id, n]));
  const todos = new Set(nos.map((n) => n.id));
  const movimentos: { id: string; novoPaiId: string }[] = [];
  for (const id of raizes) {
    const irmas = irmaosDe(nos, paiDe(porId.get(id)!, todos));
    let acima: NoArvore | undefined;
    for (let i = irmas.findIndex((n) => n.id === id) - 1; i >= 0; i--) {
      if (!escolhidas.has(irmas[i].id)) {
        acima = irmas[i];
        break;
      }
    }
    if (!acima) return { ok: false, motivo: MOTIVO_SEM_IRMA_ACIMA, linhaId: id };
    if (acima.tipoEap === "mrc") return { ok: false, motivo: MOTIVO_IRMA_E_MARCO, linhaId: id };
    movimentos.push({ id, novoPaiId: acima.id });
  }
  return { ok: true, movimentos };
}

/** Avançar várias: toda raiz da seleção precisa ter pai (linha de topo não sobe). `null` = pode. */
export function motivoParaAvancarEmLote(nos: readonly NoArvore[], ids: readonly string[]): { motivo: string; linhaId: string } | null {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const todos = new Set(nos.map((n) => n.id));
  for (const id of raizesDaSelecao(nos, ids)) {
    if (!paiDe(porId.get(id)!, todos)) return { motivo: MOTIVO_NIVEL_MAIS_ALTO, linhaId: id };
  }
  return null;
}

/**
 * Mover várias para cima (`-1`) ou para baixo (`1`): se alguma raiz da seleção já é a primeira (ou a última) do nível
 * dela, o lote inteiro é recusado — mover só as outras quebraria o bloco que a pessoa selecionou. `null` = pode.
 */
export function motivoParaMoverEmLote(
  nos: readonly NoArvore[],
  ids: readonly string[],
  direcao: -1 | 1,
): { motivo: string; linhaId: string } | null {
  for (const id of raizesDaSelecao(nos, ids)) {
    if (irmaVizinha(nos, id, direcao) === null) {
      return { motivo: direcao === -1 ? MOTIVO_PRIMEIRA_DO_NIVEL : MOTIVO_ULTIMA_DO_NIVEL, linhaId: id };
    }
  }
  return null;
}
