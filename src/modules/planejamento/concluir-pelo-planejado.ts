/**
 * 100% sem datas reais = "terminou como planejado" (pedido do dono, 2026-11-24 — spec
 * `docs/superpowers/specs/2026-11-24-concluir-pelo-planejado-design.md`). Regras puras, sem I/O: quem grava é
 * `aplicarExecucao` ("Atualizar tarefa") e `linha-service.ts` (célula do % e painel da linha), na mesma transação do %.
 *
 * Desfaz a decisão do Lote 7 ("marcar 100% não diz que terminou como planejado"): agora diz.
 *
 * Datas em `YYYY-MM-DD` (comparáveis como texto).
 */
import type { StatusEap } from "@/generated/prisma/client";

type Dia = string;

export type OrigemDasDatas = "linha_base" | "previsto";

const menor = (a: Dia, b: Dia) => (a < b ? a : b);
const maior = (a: Dia, b: Dia) => (a > b ? a : b);

/**
 * As datas reais de uma atividade dada como concluída sem datas:
 * - referência = a linha de base (as DUAS datas; o cache da versão mais recente), senão o previsto do motor (linha criada
 *   depois da aprovação). Sem nenhuma das duas: `null`.
 * - término = o da referência, limitado a hoje (real não pode ser no futuro — tarefa que acabou antes termina hoje);
 *   nunca antes do início real já gravado.
 * - início real já gravado (ponto, digitado) vence; senão o da referência, limitado ao término.
 */
export function datasPeloPlanejado(
  l: {
    inicioReal: Dia | null;
    inicioBaseline: Dia | null;
    fimBaseline: Dia | null;
    inicioPrevisto: Dia | null;
    fimPrevisto: Dia | null;
  },
  hoje: Dia,
): { inicioReal: Dia; fimReal: Dia; origem: OrigemDasDatas } | null {
  const ref: { inicio: Dia; fim: Dia; origem: OrigemDasDatas } | null =
    l.inicioBaseline && l.fimBaseline
      ? { inicio: l.inicioBaseline, fim: l.fimBaseline, origem: "linha_base" }
      : l.inicioPrevisto && l.fimPrevisto
        ? { inicio: l.inicioPrevisto, fim: l.fimPrevisto, origem: "previsto" }
        : null;
  if (!ref) return null;
  const fimLimitado = menor(ref.fim, hoje);
  const fimReal = l.inicioReal ? maior(l.inicioReal, fimLimitado) : fimLimitado;
  const inicioReal = l.inicioReal ?? menor(ref.inicio, fimReal);
  return { inicioReal, fimReal, origem: ref.origem };
}

/** Bloqueada (desbloqueie antes), suspensa, cancelada, arquivada e já concluída: o 100% não conclui por aqui. */
const NAO_CONCLUI = new Set<StatusEap>(["blq", "sus", "can", "arq", "con"]);

/**
 * O % informado leva a atividade a concluída pelo planejado? Só quando PASSA a 100 (renomear uma linha que já estava em
 * 100 não conclui nada — as antigas vão pelo script de carga), em atividade (marco não tem %, agrupamento é derivado) sem
 * término real.
 */
export function concluiPeloPercentual(
  l: { tipoEap: string; ehResumo: boolean; status: StatusEap; progresso: number; fimReal: Dia | null },
  novo: number,
): boolean {
  return novo === 100 && l.progresso < 100 && !l.ehResumo && l.tipoEap !== "mrc" && l.fimReal == null && !NAO_CONCLUI.has(l.status);
}

export function rotuloDaOrigem(origem: OrigemDasDatas): string {
  return origem === "linha_base" ? "linha de base" : "datas previstas";
}
