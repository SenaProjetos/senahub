import { ArrowDown, ArrowUp, CopyPlus, Plus, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

import {
  MOTIVO_AMBIENTES_CHEIO,
  MOTIVO_COPIA_PASSA_DO_LIMITE,
  MOTIVO_LEVANTAMENTOS_CHEIO,
  MOTIVO_PAVIMENTOS_CHEIO,
  MOTIVO_PONTOS_CHEIO,
} from "./edicao";
import { MAX_AMBIENTES, MAX_LEVANTAMENTOS, MAX_PAVIMENTOS, MAX_PONTOS_POR_AMBIENTE } from "./conteudo";

/**
 * Ações das listas do levantamento (etapa 1) — **puras** (ADR-0002). O mesmo array alimenta o menu de contexto e o
 * `…` de cada linha; a tela liga cada `id` à função de `edicao.ts`. Item que o estado impede fica inerte com o motivo.
 */

export const ACAO_LEV_DUPLICAR = "lev-duplicar";
export const ACAO_LEV_EXCLUIR = "lev-excluir";
export const ACAO_PAV_ADICIONAR_AMBIENTE = "pav-adicionar-ambiente";
export const ACAO_PAV_DUPLICAR = "pav-duplicar";
export const ACAO_PAV_SUBIR = "pav-subir";
export const ACAO_PAV_DESCER = "pav-descer";
export const ACAO_PAV_EXCLUIR = "pav-excluir";
export const ACAO_AMB_ADICIONAR_TUE = "amb-adicionar-tue";
export const ACAO_AMB_DUPLICAR = "amb-duplicar";
export const ACAO_AMB_SUBIR = "amb-subir";
export const ACAO_AMB_DESCER = "amb-descer";
export const ACAO_AMB_EXCLUIR = "amb-excluir";
export const ACAO_PONTO_DUPLICAR = "ponto-duplicar";
export const ACAO_PONTO_SUBIR = "ponto-subir";
export const ACAO_PONTO_DESCER = "ponto-descer";
export const ACAO_PONTO_EXCLUIR = "ponto-excluir";

const PRIMEIRO = (o: string) => `Este já é o primeiro ${o}.`;
const ULTIMO = (o: string) => `Este já é o último ${o}.`;

export function itensDeLevantamento(ctx: { totalLevantamentos: number; ambientes: number; ambientesNoEstudo: number; citadoPor: string[] }): AcaoItem[] {
  const citado = ctx.citadoPor.length > 0;
  return [
    {
      tipo: "acao",
      id: ACAO_LEV_DUPLICAR,
      rotulo: "Duplicar levantamento",
      icone: CopyPlus,
      desabilitado:
        ctx.totalLevantamentos >= MAX_LEVANTAMENTOS ? MOTIVO_LEVANTAMENTOS_CHEIO : ctx.ambientesNoEstudo + ctx.ambientes > MAX_AMBIENTES ? MOTIVO_COPIA_PASSA_DO_LIMITE : undefined,
    },
    { tipo: "separador", id: "sep-lev-excluir" },
    {
      tipo: "acao",
      id: ACAO_LEV_EXCLUIR,
      rotulo: "Excluir levantamento",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Excluir este levantamento?",
        descricao: citado
          ? `Os pavimentos e ambientes saem do estudo. Ele sai também do escopo de: ${ctx.citadoPor.join(", ")}. As linhas já trazidas desses cálculos continuam como estão.`
          : "Os pavimentos e ambientes saem do estudo.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}

export function itensDePavimento(ctx: { indice: number; total: number; totalPavimentos: number; ambientes: number; ambientesNoEstudo: number }): AcaoItem[] {
  return [
    {
      tipo: "acao",
      id: ACAO_PAV_ADICIONAR_AMBIENTE,
      rotulo: "Adicionar ambiente",
      icone: Plus,
      desabilitado: ctx.ambientesNoEstudo >= MAX_AMBIENTES ? MOTIVO_AMBIENTES_CHEIO : undefined,
    },
    {
      tipo: "acao",
      id: ACAO_PAV_DUPLICAR,
      rotulo: "Duplicar pavimento",
      icone: CopyPlus,
      desabilitado:
        ctx.totalPavimentos >= MAX_PAVIMENTOS ? MOTIVO_PAVIMENTOS_CHEIO : ctx.ambientesNoEstudo + ctx.ambientes > MAX_AMBIENTES ? MOTIVO_COPIA_PASSA_DO_LIMITE : undefined,
    },
    { tipo: "acao", id: ACAO_PAV_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: ctx.indice <= 0 ? PRIMEIRO("pavimento") : undefined },
    { tipo: "acao", id: ACAO_PAV_DESCER, rotulo: "Mover para baixo", icone: ArrowDown, desabilitado: ctx.indice >= ctx.total - 1 ? ULTIMO("pavimento") : undefined },
    { tipo: "separador", id: "sep-pav-excluir" },
    {
      tipo: "acao",
      id: ACAO_PAV_EXCLUIR,
      rotulo: "Excluir pavimento",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Excluir este pavimento?",
        descricao: ctx.ambientes > 0 ? `Os ${ctx.ambientes} ambiente(s) dele saem do estudo.` : undefined,
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}

export function itensDeAmbiente(ctx: { indice: number; total: number; pontos: number; ambientesNoEstudo: number }): AcaoItem[] {
  return [
    {
      tipo: "acao",
      id: ACAO_AMB_ADICIONAR_TUE,
      rotulo: "Adicionar tomada de uso específico",
      icone: Plus,
      desabilitado: ctx.pontos >= MAX_PONTOS_POR_AMBIENTE ? MOTIVO_PONTOS_CHEIO : undefined,
    },
    {
      tipo: "acao",
      id: ACAO_AMB_DUPLICAR,
      rotulo: "Duplicar ambiente",
      icone: CopyPlus,
      desabilitado: ctx.ambientesNoEstudo >= MAX_AMBIENTES ? MOTIVO_AMBIENTES_CHEIO : undefined,
    },
    { tipo: "acao", id: ACAO_AMB_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: ctx.indice <= 0 ? PRIMEIRO("ambiente") : undefined },
    { tipo: "acao", id: ACAO_AMB_DESCER, rotulo: "Mover para baixo", icone: ArrowDown, desabilitado: ctx.indice >= ctx.total - 1 ? ULTIMO("ambiente") : undefined },
    { tipo: "separador", id: "sep-amb-excluir" },
    {
      tipo: "acao",
      id: ACAO_AMB_EXCLUIR,
      rotulo: "Excluir ambiente",
      icone: Trash2,
      variant: "destructive",
      confirmar: { titulo: "Excluir este ambiente?", descricao: "As iluminações e tomadas dele saem do estudo.", rotuloConfirmar: "Excluir" },
    },
  ];
}

/** Tomada de uso específico (ou "outro") do ambiente. */
export function itensDePonto(ctx: { indice: number; total: number; pontos: number }): AcaoItem[] {
  return [
    {
      tipo: "acao",
      id: ACAO_PONTO_DUPLICAR,
      rotulo: "Duplicar tomada",
      icone: CopyPlus,
      desabilitado: ctx.pontos >= MAX_PONTOS_POR_AMBIENTE ? MOTIVO_PONTOS_CHEIO : undefined,
    },
    { tipo: "acao", id: ACAO_PONTO_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: ctx.indice <= 0 ? PRIMEIRO("item") : undefined },
    { tipo: "acao", id: ACAO_PONTO_DESCER, rotulo: "Mover para baixo", icone: ArrowDown, desabilitado: ctx.indice >= ctx.total - 1 ? ULTIMO("item") : undefined },
    { tipo: "separador", id: "sep-ponto-excluir" },
    { tipo: "acao", id: ACAO_PONTO_EXCLUIR, rotulo: "Excluir tomada", icone: Trash2, variant: "destructive", confirmar: { titulo: "Excluir esta tomada?", rotuloConfirmar: "Excluir" } },
  ];
}
