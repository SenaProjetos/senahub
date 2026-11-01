/**
 * Recusas do ciclo que a pessoa pode contornar com uma confirmação explícita, que vira evento no
 * histórico. PURO (vai ao cliente): o diálogo de uma revisão e o relatório do lote reconhecem a recusa
 * pela MESMA frase do `ActionError` e mostram os mesmos textos.
 *  - carimbo: o carimbo do PDF não foi lido no "Enviar para análise" (D9);
 *  - dwg: documento sem tipo publicado sem DWG (decisão do dono, 2026-10-21).
 */
import { MOTIVO_CARIMBO_ILEGIVEL } from "./carimbo";
import { MOTIVO_SEM_DWG_SEM_TIPO } from "./regras";

export const CONFIRMACOES_DO_CICLO = {
  carimbo: {
    motivo: MOTIVO_CARIMBO_ILEGIVEL,
    aviso: (n: number) =>
      n === 1
        ? "Em 1 revisão o sistema não leu o código e a revisão no carimbo do PDF."
        : `Em ${n} revisões o sistema não leu o código e a revisão no carimbo do PDF.`,
    caixa: (n: number) =>
      n === 1
        ? "Conferi o carimbo, ou o documento não tem carimbo (um memorial, por exemplo). Enviar sem a conferência automática (fica registrado no histórico)."
        : "Conferi o carimbo dessas revisões, ou elas não têm carimbo (memoriais, por exemplo). Enviar sem a conferência automática (fica registrado no histórico de cada uma).",
    botaoLote: (n: number) => (n === 1 ? "Enviar sem a conferência" : `Enviar as ${n} sem a conferência`),
  },
  dwg: {
    motivo: MOTIVO_SEM_DWG_SEM_TIPO,
    aviso: (n: number) =>
      n === 1
        ? "1 revisão não tem DWG e o documento não tem um tipo que diga se ele é exigido."
        : `${n} revisões não têm DWG e os documentos não têm um tipo que diga se ele é exigido.`,
    caixa: (n: number) =>
      n === 1
        ? "Este documento não precisa de DWG (memorial, planilha…). Publicar sem o DWG (fica registrado no histórico)."
        : "Esses documentos não precisam de DWG (memoriais, planilhas…). Publicar sem o DWG (fica registrado no histórico de cada um).",
    botaoLote: (n: number) => (n === 1 ? "Publicar sem o DWG" : `Publicar as ${n} sem o DWG`),
  },
} as const;

export type ConfirmacaoDoCiclo = keyof typeof CONFIRMACOES_DO_CICLO;

/** Qual confirmação uma recusa pede (`null` = erro comum, a corrigir). */
export function confirmacaoDaRecusa(erro: string | undefined): ConfirmacaoDoCiclo | null {
  return (Object.keys(CONFIRMACOES_DO_CICLO) as ConfirmacaoDoCiclo[]).find((c) => CONFIRMACOES_DO_CICLO[c].motivo === erro) ?? null;
}
