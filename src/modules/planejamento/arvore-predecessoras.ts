/**
 * Escolher predecessoras numa ÁRVORE — PURO. A célula Predecessoras continua aceitando texto (`1.2.3FS+2`); a janela da
 * árvore lista todas as linhas, com as que NÃO podem ser predecessoras desabilitadas e a frase do motivo, e devolve o
 * mesmo conjunto de vínculos (um reagendamento só, pelo mesmo caminho da célula).
 */
import { paiDe, type NoArvore } from "./arvore-eap";
import { ordemDeDocumento } from "./arvore-lote";
import { criaCiclo, type Aresta } from "./ciclo-dependencias";
import type { Vinculo } from "./gantt-linhas";

export const MOTIVO_PRED_PROPRIA = "Uma tarefa não pode ser predecessora de si mesma.";
export const MOTIVO_PRED_DESCENDENTE = "Uma subtarefa não pode ser predecessora da tarefa-mãe.";
export const MOTIVO_PRED_MAE = "Uma tarefa-mãe não pode ser predecessora de uma subtarefa dela.";
export const MOTIVO_PRED_CICLO = "Criaria um ciclo: esta tarefa já depende (direta ou indiretamente) da linha que você está editando.";

export type OpcaoPredecessora = {
  id: string;
  codigo: string;
  nome: string;
  /** 0 = raiz. */
  nivel: number;
  /** A frase do motivo, ou `null` quando pode ser escolhida. */
  desabilitada: string | null;
};

export function opcoesDePredecessora(p: {
  linhas: readonly { id: string; parentId: string | null; ordem: number; codigo: string; nome: string; tipoEap: string }[];
  dependencias: readonly Aresta[];
  linhaId: string;
}): OpcaoPredecessora[] {
  const nos: NoArvore[] = p.linhas.map((l) => ({ id: l.id, parentId: l.parentId, ordem: l.ordem, tipoEap: l.tipoEap }));
  const porId = new Map(p.linhas.map((l) => [l.id, l]));
  const noPorId = new Map(nos.map((n) => [n.id, n]));
  const todos = new Set(nos.map((n) => n.id));

  const ancestrais = (id: string): string[] => {
    const saida: string[] = [];
    const vistos = new Set<string>([id]);
    for (let pai = paiDe(noPorId.get(id)!, todos); pai && !vistos.has(pai); pai = paiDe(noPorId.get(pai)!, todos)) {
      saida.push(pai);
      vistos.add(pai);
    }
    return saida;
  };
  const daLinha = new Set(ancestrais(p.linhaId));

  return ordemDeDocumento(nos).map((id) => {
    const l = porId.get(id)!;
    let desabilitada: string | null = null;
    if (id === p.linhaId) desabilitada = MOTIVO_PRED_PROPRIA;
    else if (ancestrais(id).includes(p.linhaId)) desabilitada = MOTIVO_PRED_DESCENDENTE;
    else if (daLinha.has(id)) desabilitada = MOTIVO_PRED_MAE;
    // O conjunto da linha é trocado inteiro: `criaCiclo` já ignora os vínculos que ela tem hoje.
    else if (criaCiclo(p.dependencias, p.linhaId, [id])) desabilitada = MOTIVO_PRED_CICLO;
    return { id, codigo: l.codigo, nome: l.nome, nivel: ancestrais(id).length, desabilitada };
  });
}

/**
 * O conjunto de vínculos depois de marcar/desmarcar na árvore: quem já era predecessora mantém o tipo e o atraso; quem
 * entra é término→início sem atraso (o tipo e o atraso se ajustam no texto da célula ou na janela da linha).
 */
export function aplicarEscolha(atuais: readonly Vinculo[], escolhidas: ReadonlySet<string>): Vinculo[] {
  const jaTinha = new Map(atuais.map((v) => [v.predecessoraId, v]));
  const mantidos = atuais.filter((v) => escolhidas.has(v.predecessoraId));
  const novos = [...escolhidas].filter((id) => !jaTinha.has(id)).map((id): Vinculo => ({ predecessoraId: id, tipo: "fs", lagDias: 0 }));
  return [...mantidos, ...novos];
}
