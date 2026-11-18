import { ArrowDown, ArrowUp, CopyPlus, RefreshCw, Trash2, Undo2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

import { MAX_CALCULOS } from "./conteudo";
import { MOTIVO_CALCULOS_CHEIO, MOTIVO_LINHAS_CHEIO, MOTIVO_TIPOS_CHEIO } from "./edicao-calculo";

/**
 * Ações das listas da etapa 2 (cálculos, linhas de carga e tipos de apartamento) — **puras** (ADR-0002). O mesmo array
 * alimenta o menu de contexto e o `⋯`. Item que o estado impede fica inerte com o motivo (a frase que a tela já usa).
 */

export const ACAO_CALC_DUPLICAR = "calc-duplicar";
export const ACAO_CALC_SUBIR = "calc-subir";
export const ACAO_CALC_DESCER = "calc-descer";
export const ACAO_CALC_EXCLUIR = "calc-excluir";
export const ACAO_LINHA_DUPLICAR = "linha-duplicar";
export const ACAO_LINHA_SUBIR = "linha-subir";
export const ACAO_LINHA_DESCER = "linha-descer";
export const ACAO_LINHA_ATUALIZAR = "linha-atualizar";
export const ACAO_LINHA_DESCARTAR_EDICAO = "linha-descartar-edicao";
export const ACAO_LINHA_EXCLUIR = "linha-excluir";
export const ACAO_TIPO_DUPLICAR = "tipo-duplicar";
export const ACAO_TIPO_SUBIR = "tipo-subir";
export const ACAO_TIPO_DESCER = "tipo-descer";
export const ACAO_TIPO_EXCLUIR = "tipo-excluir";

export const MOTIVO_LINHA_SEM_VINCULO = "Esta linha foi digitada, não vem do levantamento.";
export const MOTIVO_LINHA_EDITADA = "A linha foi editada. Descarte a edição para refazê-la a partir do levantamento.";
export const MOTIVO_LINHA_ATUALIZADA = "A linha já está igual ao levantamento.";

const PRIMEIRO = (o: string) => `Este já é o primeiro ${o}.`;
const ULTIMO = (o: string) => `Este já é o último ${o}.`;

export function itensDeCalculo(ctx: { indice: number; total: number; nome: string; medidoresQueCitam: number }): AcaoItem[] {
  return [
    {
      tipo: "acao",
      id: ACAO_CALC_DUPLICAR,
      rotulo: "Duplicar cálculo",
      icone: CopyPlus,
      desabilitado: ctx.total >= MAX_CALCULOS ? MOTIVO_CALCULOS_CHEIO : undefined,
    },
    { tipo: "acao", id: ACAO_CALC_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: ctx.indice <= 0 ? PRIMEIRO("cálculo") : undefined },
    { tipo: "acao", id: ACAO_CALC_DESCER, rotulo: "Mover para baixo", icone: ArrowDown, desabilitado: ctx.indice >= ctx.total - 1 ? ULTIMO("cálculo") : undefined },
    { tipo: "separador", id: "sep-calc-excluir" },
    {
      tipo: "acao",
      id: ACAO_CALC_EXCLUIR,
      rotulo: "Excluir cálculo",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: `Excluir o cálculo ${ctx.nome || "sem nome"}?`,
        descricao:
          ctx.medidoresQueCitam > 0
            ? `${ctx.medidoresQueCitam} medidor(es) dos CMDs usam este cálculo e saem junto, com a entrada dele.`
            : "As linhas e o resultado deste cálculo saem do estudo.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}

export function itensDeLinhaDeCarga(ctx: {
  indice: number;
  total: number;
  /** A linha vem do levantamento (tem vínculo). */
  vinculada: boolean;
  /** A linha foi editada à mão depois de trazida. */
  editada: boolean;
  /** O levantamento mudou depois de trazer, ou a linha foi editada: há o que atualizar. */
  desatualizada: boolean;
  linhasNoCalculo: number;
}): AcaoItem[] {
  const itens: AcaoItem[] = [
    {
      tipo: "acao",
      id: ACAO_LINHA_DUPLICAR,
      rotulo: "Duplicar linha",
      icone: CopyPlus,
      desabilitado: ctx.linhasNoCalculo >= 100 ? MOTIVO_LINHAS_CHEIO : undefined,
    },
    { tipo: "acao", id: ACAO_LINHA_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: ctx.indice <= 0 ? PRIMEIRO("item") : undefined },
    { tipo: "acao", id: ACAO_LINHA_DESCER, rotulo: "Mover para baixo", icone: ArrowDown, desabilitado: ctx.indice >= ctx.total - 1 ? ULTIMO("item") : undefined },
    { tipo: "separador", id: "sep-linha-levantamento" },
    {
      tipo: "acao",
      id: ACAO_LINHA_ATUALIZAR,
      rotulo: "Atualizar do levantamento",
      icone: RefreshCw,
      desabilitado: !ctx.vinculada ? MOTIVO_LINHA_SEM_VINCULO : ctx.editada ? MOTIVO_LINHA_EDITADA : !ctx.desatualizada ? MOTIVO_LINHA_ATUALIZADA : undefined,
    },
  ];
  // Descartar a edição só aparece onde há edição: nunca sobrescreve sozinho, só quando a pessoa pede (spec §3.1, regra 3).
  if (ctx.vinculada && ctx.editada) {
    itens.push({
      tipo: "acao",
      id: ACAO_LINHA_DESCARTAR_EDICAO,
      rotulo: "Descartar edição e atualizar",
      icone: Undo2,
      confirmar: { titulo: "Descartar a edição desta linha?", descricao: "Quantidade, potência e FP voltam a ser os do levantamento.", rotuloConfirmar: "Descartar e atualizar" },
    });
  }
  itens.push(
    { tipo: "separador", id: "sep-linha-excluir" },
    { tipo: "acao", id: ACAO_LINHA_EXCLUIR, rotulo: "Excluir linha", icone: Trash2, variant: "destructive", confirmar: { titulo: "Excluir esta linha?", rotuloConfirmar: "Excluir" } },
  );
  return itens;
}

export function itensDeTipoApartamento(ctx: { indice: number; total: number; tiposNoCalculo: number; medidoresQueCitam: number }): AcaoItem[] {
  return [
    {
      tipo: "acao",
      id: ACAO_TIPO_DUPLICAR,
      rotulo: "Duplicar tipo",
      icone: CopyPlus,
      desabilitado: ctx.tiposNoCalculo >= 40 ? MOTIVO_TIPOS_CHEIO : undefined,
    },
    { tipo: "acao", id: ACAO_TIPO_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: ctx.indice <= 0 ? PRIMEIRO("tipo") : undefined },
    { tipo: "acao", id: ACAO_TIPO_DESCER, rotulo: "Mover para baixo", icone: ArrowDown, desabilitado: ctx.indice >= ctx.total - 1 ? ULTIMO("tipo") : undefined },
    { tipo: "separador", id: "sep-tipo-excluir" },
    {
      tipo: "acao",
      id: ACAO_TIPO_EXCLUIR,
      rotulo: "Excluir tipo de apartamento",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Excluir este tipo de apartamento?",
        descricao: ctx.medidoresQueCitam > 0 ? `${ctx.medidoresQueCitam} medidor(es) residenciais dos CMDs usam este tipo e saem junto.` : undefined,
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}
