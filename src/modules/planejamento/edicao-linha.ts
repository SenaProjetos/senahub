/**
 * Regras de edição de uma linha da EAP (B2) — PURO, para o servidor garantir o que a tela esconde.
 *
 * - O editor só alterna atividade ↔ marco. Disciplina, pacote, resumo e os demais tipos da EAP ficam
 *   como estão: antes qualquer edição rebaixava a linha a atividade.
 * - Agrupamento (linha com filhas) não tem duração própria: ela deriva das filhas, e a informada é
 *   ignorada. Agrupamento também não vira marco.
 * - Marco dura 0 por definição (Doc 03 §11). Atividade precisa de duração maior que zero.
 */

import type { TipoEap } from "@/generated/prisma/client";

export type LinhaAntes = { tipoEap: TipoEap; duracaoDias: number; ehResumo: boolean };
export type PedidoEdicao = { marco: boolean; duracaoDias?: number };

export type ResultadoEdicao =
  | { ok: true; tipoEap: TipoEap; /** `undefined` = não gravar (agrupamento). */ duracaoDias: number | undefined; virouMarco: boolean }
  | { ok: false; motivo: string };

export function regrasDeEdicao(antes: LinhaAntes, pedido: PedidoEdicao): ResultadoEdicao {
  const alterna = antes.tipoEap === "atv" || antes.tipoEap === "mrc";
  const tipoEap: TipoEap = alterna ? (pedido.marco ? "mrc" : "atv") : antes.tipoEap;
  if (tipoEap === "mrc" && antes.ehResumo) {
    return { ok: false, motivo: "Linha com subtarefas não vira marco — ela é um agrupamento." };
  }
  let duracaoDias: number | undefined;
  if (tipoEap === "mrc") duracaoDias = 0;
  else if (!antes.ehResumo) {
    const d = pedido.duracaoDias ?? antes.duracaoDias;
    if (!(d > 0)) return { ok: false, motivo: "Informe a duração em dias úteis." };
    duracaoDias = d;
  }
  return { ok: true, tipoEap, duracaoDias, virouMarco: tipoEap === "mrc" && antes.tipoEap !== "mrc" };
}
