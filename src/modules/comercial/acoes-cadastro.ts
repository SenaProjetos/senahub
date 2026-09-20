import { Copy, Pencil, Power, PowerOff } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações dos cadastros arquiváveis do comercial (parceiros e campanhas) — **puro**. Os dois têm a
 * mesma forma: editar e arquivar/reativar. O mesmo array alimenta o menu de contexto, o `...` e a
 * barra de seleção (ADR-0002, regra 2).
 *
 * As duas listas chegam inteiras ao navegador, então o lote conhece o estado real de cada
 * selecionado e desabilita, com o motivo, o que não teria efeito.
 */

export const ACAO_EDITAR = "editar";
export const ACAO_ALTERNAR_ATIVO = "alternar-ativo";
export const ACAO_COPIAR_NOME = "copiar-nome";
export const ACAO_LOTE_ARQUIVAR = "lote-arquivar";
export const ACAO_LOTE_REATIVAR = "lote-reativar";

export const MOTIVO_TODOS_ARQUIVADOS = "Todos os selecionados já estão arquivados.";
export const MOTIVO_TODOS_ATIVOS = "Todos os selecionados já estão ativos.";

export function itensDeCadastroArquivavel(c: { ativo: boolean }): AcaoItem[] {
  return [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil },
    {
      tipo: "acao",
      id: ACAO_ALTERNAR_ATIVO,
      rotulo: c.ativo ? "Arquivar" : "Reativar",
      icone: c.ativo ? PowerOff : Power,
    },
    { tipo: "separador", id: "sep-copiar" },
    // Reposição do "Copiar" que o menu nativo dava no texto da linha (ADR-0002, regra 1).
    { tipo: "acao", id: ACAO_COPIAR_NOME, rotulo: "Copiar nome", icone: Copy },
  ];
}

export function itensDeLoteArquivaveis(selecionados: readonly { ativo: boolean }[]): AcaoItem[] {
  const todosArquivados = selecionados.length > 0 && selecionados.every((s) => !s.ativo);
  const todosAtivos = selecionados.length > 0 && selecionados.every((s) => s.ativo);
  return [
    {
      tipo: "acao",
      id: ACAO_LOTE_ARQUIVAR,
      rotulo: "Arquivar",
      icone: PowerOff,
      desabilitado: todosArquivados ? MOTIVO_TODOS_ARQUIVADOS : undefined,
    },
    {
      tipo: "acao",
      id: ACAO_LOTE_REATIVAR,
      rotulo: "Reativar",
      icone: Power,
      desabilitado: todosAtivos ? MOTIVO_TODOS_ATIVOS : undefined,
    },
  ];
}
