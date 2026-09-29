/**
 * Versões da linha de base (BL-00, BL-01…) — o que a tela mostra e compara. PURO, client-safe.
 *
 * A baseline nunca é sobrescrita (`congelarBaseline` só acrescenta): aprovar cria a BL-00, e cada "Nova linha de
 * base" (o antigo "Replanejar", com motivo obrigatório) cria a seguinte. O Gantt e as colunas de desvio sempre
 * leram a MAIS RECENTE (o cache em `EapTarefa.inicioBaseline`/`fimBaseline`); a reunião de 29/09/2026 pediu ver
 * também as anteriores — "linha de base um, linha de base dois", comparar o plano de hoje com o combinado de
 * antes. As datas de cada versão vêm de `EapBaselineLinha` e entram aqui só como sobreposição, sem tocar no cache.
 */

export type VersaoBaseline = {
  numero: number;
  motivo: string | null;
  /** ISO. */
  criadaEm: string;
  autor: string | null;
  linhas: number;
};

/** Datas congeladas de uma versão: `tarefaId → [início, término]` (ISO). */
export type DatasDaBaseline = Record<string, [string, string]>;

/** `BL-00`, `BL-01`… */
export function rotuloBaseline(numero: number): string {
  return `BL-${String(numero).padStart(2, "0")}`;
}

/** O motivo, ou o que se sabe dele: a BL-00 nasce da aprovação e sempre tem motivo escrito; a falta é de dado antigo. */
export function motivoDaBaseline(b: Pick<VersaoBaseline, "numero" | "motivo">): string {
  const motivo = b.motivo?.trim().replace(/\.$/, "");
  if (motivo) return motivo;
  return b.numero === 0 ? "Aprovação do cronograma" : "Sem motivo registrado";
}

/** A linha da lista de versões: "BL-01 · Atraso na aprovação da arquitetura (atual)". */
export function rotuloDaOpcao(b: Pick<VersaoBaseline, "numero" | "motivo">, atual: boolean): string {
  return `${rotuloBaseline(b.numero)} · ${motivoDaBaseline(b)}${atual ? " (atual)" : ""}`;
}

/**
 * As tarefas com as datas de base de UMA versão no lugar das da mais recente. `escolhida` nulo (ou a versão atual,
 * que não vem em `datas` porque já está nas tarefas) devolve a lista como veio. Linha que não existia naquela
 * versão fica sem base (`null`): nasceu depois, e comparar com nada é mais honesto que comparar com a de hoje.
 */
export function tarefasComBaseline<T extends { id: string; inicioBaseline: string | null; fimBaseline: string | null }>(
  tarefas: readonly T[],
  escolhida: number | null,
  datas: Readonly<Record<number, DatasDaBaseline>>,
): T[] {
  const daVersao = escolhida == null ? undefined : datas[escolhida];
  if (!daVersao) return [...tarefas];
  return tarefas.map((t) => {
    const d = daVersao[t.id];
    return { ...t, inicioBaseline: d?.[0] ?? null, fimBaseline: d?.[1] ?? null };
  });
}
