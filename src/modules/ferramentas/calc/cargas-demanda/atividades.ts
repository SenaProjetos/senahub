/**
 * Iluminância mantida (Em) sugerida pela atividade — **puro**. NBR ISO/CIE 8995-1:2013, seção 5 (biblioteca
 * `nbr8995.ts`). A tela escolhe a atividade da lista; "outra" (ou atividade sem número na norma) deixa o Em para o
 * projetista digitar, com o informativo da spec §6.
 */

import { NBR8995_SECAO_5, type AtividadeIluminancia } from "./biblioteca/nbr8995";
import { MSG, type Mensagem } from "./mensagens";

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Atividades cujo texto (categoria, subgrupo ou atividade) contém todos os termos, sem acento nem caixa. */
export function procurarAtividades(termo: string): AtividadeIluminancia[] {
  const termos = semAcento(termo).split(/\s+/).filter(Boolean);
  return NBR8995_SECAO_5.linhas.filter((a) => {
    const alvo = semAcento(`${a.categoria} ${a.subgrupo ?? ""} ${a.atividade}`);
    return termos.every((t) => alvo.includes(t));
  });
}

export type EmSugerido = { emLux: number | null; atividade: AtividadeIluminancia | null; avisos: Mensagem[] };

/** Em da atividade pelo `id` da linha. Sem atividade ou sem número: `null` e o informativo "atividade não listada". */
export function emDaAtividade(id: string | null | undefined): EmSugerido {
  const atividade = id ? (NBR8995_SECAO_5.linhas.find((a) => a.id === id) ?? null) : null;
  const emLux = atividade?.emLux ?? null;
  return { emLux, atividade, avisos: emLux == null ? [MSG.atividadeNaoListada()] : [] };
}
