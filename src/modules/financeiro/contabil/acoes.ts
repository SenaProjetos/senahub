import { Copy, Eraser, ListTree, Search, Wallet } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha do de-para contábil (ADR-0002) — **puro**. Mesmo array no menu de contexto e no `...`.
 * Itens e frases do mock aprovado (prancha "Integração contábil", 2026-10-02).
 */

export const ACAO_ESCOLHER_CONTA = "escolher-conta";
export const ACAO_COPIAR_CONTA = "copiar-conta";
export const ACAO_VER_LANCAMENTOS = "ver-lancamentos";
export const ACAO_LIMPAR_CONTA = "limpar-conta";
export const ACAO_VER_EXTRATO = "ver-extrato";

export const MOTIVO_SEM_CONTA_PROPRIA = "Ainda não tem conta contábil.";
export const MOTIVO_NADA_PARA_COPIAR = "Nenhuma outra categoria do mesmo tipo tem conta contábil.";

export type CategoriaParaAcoes = {
  /** A categoria tem linha própria no de-para (conta escolhida ou "não exportar"). */
  temLinhaPropria: boolean;
  /** Há outra categoria do mesmo tipo com conta para copiar. */
  temDeOndeCopiar: boolean;
};

/** `rotuloMes`: "setembro" — o mês em foco na tela. */
export function itensDeCategoriaContabil(c: CategoriaParaAcoes, rotuloMes: string): AcaoItem[] {
  return limparSeparadores([
    { tipo: "acao", id: ACAO_ESCOLHER_CONTA, rotulo: "Escolher conta contábil…", icone: ListTree },
    { tipo: "acao", id: ACAO_COPIAR_CONTA, rotulo: "Copiar de outra categoria…", icone: Copy, desabilitado: c.temDeOndeCopiar ? undefined : MOTIVO_NADA_PARA_COPIAR },
    { tipo: "acao", id: ACAO_VER_LANCAMENTOS, rotulo: `Ver lançamentos de ${rotuloMes}`, icone: Search },
    { tipo: "separador", id: "sep" },
    { tipo: "acao", id: ACAO_LIMPAR_CONTA, rotulo: "Limpar conta", icone: Eraser, desabilitado: c.temLinhaPropria ? undefined : MOTIVO_SEM_CONTA_PROPRIA },
  ]);
}

/** Conta bancária: escolher/limpar a conta e abrir o extrato do mês. */
export function itensDeContaBancariaContabil(c: { temConta: boolean; contaId: string; mes: string; rotuloMes: string }): AcaoItem[] {
  return limparSeparadores([
    { tipo: "acao", id: ACAO_ESCOLHER_CONTA, rotulo: "Escolher conta contábil…", icone: ListTree },
    { tipo: "link", id: ACAO_VER_EXTRATO, rotulo: `Ver extrato de ${c.rotuloMes}`, icone: Wallet, href: `/financeiro/extrato?conta=${c.contaId}&mes=${c.mes}` },
    { tipo: "separador", id: "sep" },
    { tipo: "acao", id: ACAO_LIMPAR_CONTA, rotulo: "Limpar conta", icone: Eraser, desabilitado: c.temConta ? undefined : MOTIVO_SEM_CONTA_PROPRIA },
  ]);
}
