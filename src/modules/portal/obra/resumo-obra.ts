/**
 * Resumo diário de obra (spec docs/superpowers/specs/2026-11-25-portal-conta-obra-design.md, "Resumo diário de obra"). Puro:
 * transforma as duas fontes de "Liberado para obra" em mudanças (aplicado/removido), junta por documento e dia de São Paulo em
 * fatos (liberada, substituída, retirada) e monta o item da lista. A leitura do banco e o envio ficam em `resumo-service.ts`.
 *
 * - Dentro do ciclo documental: o controle `liberado_obra` (`aplicadoEm` / `removidoEm`). O controle da migração não gera
 *   "liberada" (a data dele é a da migração), mas a remoção dele conta — a obra viu o arquivo sair.
 * - Fora do ciclo: os eventos `situacao_marcada` / `situacao_retirada` da pasta. Marcar uma revisão sobre outra gera só
 *   `situacao_marcada`; aqui vira "removida a anterior + aplicada a nova" no mesmo instante.
 */
import { diaDeSaoPaulo } from "@/lib/data";
import { rotuloRevisao } from "@/lib/utils";
import { fimDoDiaSp, type ItemDoResumo } from "../resumo-diario";

export type MudancaObra = { documentoId: string; numero: number; tipo: "aplicado" | "removido"; em: Date };

const porInstante = (a: MudancaObra, b: MudancaObra) => a.em.getTime() - b.em.getTime();

export function mudancasDosControles(
  c: readonly { documentoId: string; numero: number; aplicadoEm: Date; removidoEm: Date | null; origem: string | null }[],
): MudancaObra[] {
  const m: MudancaObra[] = [];
  for (const x of c) {
    if (x.origem !== "migracao") m.push({ documentoId: x.documentoId, numero: x.numero, tipo: "aplicado", em: x.aplicadoEm });
    if (x.removidoEm) m.push({ documentoId: x.documentoId, numero: x.numero, tipo: "removido", em: x.removidoEm });
  }
  return m.sort(porInstante);
}

/** Lê os eventos em ordem, guardando a revisão marcada de cada documento (por isso precisa do histórico, não só da janela). */
export function mudancasDosEventos(
  e: readonly { documentoId: string; tipo: "situacao_marcada" | "situacao_retirada"; revisao: number; em: Date }[],
): MudancaObra[] {
  const marcada = new Map<string, number>();
  const m: MudancaObra[] = [];
  for (const x of [...e].sort((a, b) => a.em.getTime() - b.em.getTime())) {
    const atual = marcada.get(x.documentoId);
    if (x.tipo === "situacao_marcada") {
      if (atual === x.revisao) continue;
      if (atual !== undefined) m.push({ documentoId: x.documentoId, numero: atual, tipo: "removido", em: x.em });
      m.push({ documentoId: x.documentoId, numero: x.revisao, tipo: "aplicado", em: x.em });
      marcada.set(x.documentoId, x.revisao);
    } else if (atual !== undefined) {
      m.push({ documentoId: x.documentoId, numero: atual, tipo: "removido", em: x.em });
      marcada.delete(x.documentoId);
    }
  }
  return m;
}

export type FatoObra = {
  dia: string;
  documentoId: string;
  tipo: "liberada" | "substituida" | "retirada";
  de: number | null;
  para: number | null;
};

/**
 * Um fato por documento e dia pedido. No mesmo dia, uma revisão que entrou e saiu se anula; sobrou saída e entrada = substituída
 * (a última que saiu → a última que entrou), só entrada = liberada, só saída = retirada. Em dias diferentes são fatos separados
 * (é o que a obra viu de fato).
 */
export function fatosDaObra(m: readonly MudancaObra[], dias: readonly string[]): FatoObra[] {
  const pedidos = new Set(dias);
  const grupos = new Map<string, { dia: string; documentoId: string; aplicados: number[]; removidos: number[] }>();
  for (const x of [...m].sort(porInstante)) {
    const dia = diaDeSaoPaulo(x.em);
    if (!pedidos.has(dia)) continue;
    const chave = `${dia}|${x.documentoId}`;
    const g = grupos.get(chave) ?? { dia, documentoId: x.documentoId, aplicados: [], removidos: [] };
    grupos.set(chave, g);
    (x.tipo === "aplicado" ? g.aplicados : g.removidos).push(x.numero);
  }
  const fatos: FatoObra[] = [];
  for (const g of grupos.values()) {
    const aplicados = [...g.aplicados];
    const removidos = [...g.removidos];
    for (const n of [...aplicados]) {
      const i = removidos.indexOf(n);
      if (i >= 0) {
        removidos.splice(i, 1);
        aplicados.splice(aplicados.indexOf(n), 1);
      }
    }
    const para = aplicados.at(-1) ?? null;
    const de = removidos.at(-1) ?? null;
    if (para !== null && de !== null) fatos.push({ dia: g.dia, documentoId: g.documentoId, tipo: "substituida", de, para });
    else if (para !== null) fatos.push({ dia: g.dia, documentoId: g.documentoId, tipo: "liberada", de: null, para });
    else if (de !== null) fatos.push({ dia: g.dia, documentoId: g.documentoId, tipo: "retirada", de, para: null });
  }
  return fatos.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
}

/** O item da lista do resumo: disciplina + nome do documento + o que aconteceu, com o rótulo de revisão das Entregas. */
export function itemDoFato(f: FatoObra, doc: { disciplina: string; nome: string }): ItemDoResumo {
  const r = (n: number | null) => rotuloRevisao(n ?? 0);
  const oQue =
    f.tipo === "liberada"
      ? `liberada para obra (${r(f.para)})`
      : f.tipo === "substituida"
        ? `substituída: ${r(f.de)} → ${r(f.para)}`
        : `retirada de obra (${r(f.de)})`;
  return { dia: f.dia, disciplina: doc.disciplina, texto: `${doc.nome} · ${oQue}` };
}

/** Os dias que a conta recebe: só os que terminaram depois de ela (ou a obra na lista dela) existir. */
export function diasDaConta(dias: readonly string[], desde: Date): string[] {
  return dias.filter((d) => desde.getTime() < fimDoDiaSp(d).getTime());
}
