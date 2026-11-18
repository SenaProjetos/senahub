import { ArrowDown, ArrowUp, CopyPlus, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

import { MAX_CMDS, MAX_MEDIDORES_POR_CMD } from "./conteudo";
import { MOTIVO_CMDS_CHEIO, MOTIVO_MEDIDORES_CHEIO } from "./edicao-centros";

/** Ações das listas da etapa 3 (CMDs e medidores) — **puras** (ADR-0002). */

export const ACAO_CMD_DUPLICAR = "cmd-duplicar";
export const ACAO_CMD_SUBIR = "cmd-subir";
export const ACAO_CMD_DESCER = "cmd-descer";
export const ACAO_CMD_EXCLUIR = "cmd-excluir";
export const ACAO_MEDIDOR_DUPLICAR = "medidor-duplicar";
export const ACAO_MEDIDOR_SUBIR = "medidor-subir";
export const ACAO_MEDIDOR_DESCER = "medidor-descer";
export const ACAO_MEDIDOR_EXCLUIR = "medidor-excluir";

const PRIMEIRO = (o: string) => `Este já é o primeiro ${o}.`;
const ULTIMO = (o: string) => `Este já é o último ${o}.`;

export function itensDeCmd(ctx: { indice: number; total: number; nome: string; temEntrada: boolean }): AcaoItem[] {
  return [
    { tipo: "acao", id: ACAO_CMD_DUPLICAR, rotulo: "Duplicar CMD", icone: CopyPlus, desabilitado: ctx.total >= MAX_CMDS ? MOTIVO_CMDS_CHEIO : undefined },
    { tipo: "acao", id: ACAO_CMD_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: ctx.indice <= 0 ? PRIMEIRO("CMD") : undefined },
    { tipo: "acao", id: ACAO_CMD_DESCER, rotulo: "Mover para baixo", icone: ArrowDown, desabilitado: ctx.indice >= ctx.total - 1 ? ULTIMO("CMD") : undefined },
    { tipo: "separador", id: "sep-cmd-excluir" },
    {
      tipo: "acao",
      id: ACAO_CMD_EXCLUIR,
      rotulo: "Excluir CMD",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: `Excluir o ${ctx.nome || "CMD"}?`,
        descricao: ctx.temEntrada ? "Os medidores e a entrada dele (corrente, disjuntor e cabo) saem do estudo." : "Os medidores dele saem do estudo.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}

export function itensDeMedidor(ctx: { indice: number; total: number }): AcaoItem[] {
  return [
    { tipo: "acao", id: ACAO_MEDIDOR_DUPLICAR, rotulo: "Duplicar medidor", icone: CopyPlus, desabilitado: ctx.total >= MAX_MEDIDORES_POR_CMD ? MOTIVO_MEDIDORES_CHEIO : undefined },
    { tipo: "acao", id: ACAO_MEDIDOR_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: ctx.indice <= 0 ? PRIMEIRO("medidor") : undefined },
    { tipo: "acao", id: ACAO_MEDIDOR_DESCER, rotulo: "Mover para baixo", icone: ArrowDown, desabilitado: ctx.indice >= ctx.total - 1 ? ULTIMO("medidor") : undefined },
    { tipo: "separador", id: "sep-medidor-excluir" },
    { tipo: "acao", id: ACAO_MEDIDOR_EXCLUIR, rotulo: "Excluir medidor", icone: Trash2, variant: "destructive", confirmar: { titulo: "Excluir este medidor?", rotuloConfirmar: "Excluir" } },
  ];
}
