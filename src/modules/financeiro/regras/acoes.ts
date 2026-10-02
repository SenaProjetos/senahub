import { ArrowUp, CopyPlus, Pause, Pencil, Play, Search, Trash2, WandSparkles } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma regra de preenchimento (ADR-0002) — **puro**. Mesmo array no menu de contexto e no `...`.
 * A ordem é da lista: a primeira que casa vale, então "Subir na ordem" é uma ação de primeira classe.
 */

export const ACAO_EDITAR = "editar";
export const ACAO_VER_LANCAMENTOS = "ver-lancamentos";
export const ACAO_DUPLICAR = "duplicar";
export const ACAO_SUBIR = "subir";
export const ACAO_PAUSAR = "pausar";
export const ACAO_ATIVAR = "ativar";
export const ACAO_EXCLUIR = "excluir";

export const MOTIVO_JA_E_A_PRIMEIRA = "Já é a primeira da lista.";

export type RegraParaAcoes = { ativo: boolean; primeira: boolean };
export type ContextoRegra = { podeGerir: boolean };

export function itensDeRegraDePreenchimento(r: RegraParaAcoes, ctx: ContextoRegra): AcaoItem[] {
  if (!ctx.podeGerir) return [];
  const itens: AcaoItem[] = [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil },
    { tipo: "acao", id: ACAO_VER_LANCAMENTOS, rotulo: "Ver os lançamentos que casam", icone: Search },
    { tipo: "acao", id: ACAO_DUPLICAR, rotulo: "Duplicar", icone: CopyPlus },
    { tipo: "acao", id: ACAO_SUBIR, rotulo: "Subir na ordem", icone: ArrowUp, desabilitado: r.primeira ? MOTIVO_JA_E_A_PRIMEIRA : undefined },
    r.ativo
      ? { tipo: "acao", id: ACAO_PAUSAR, rotulo: "Pausar", icone: Pause }
      : { tipo: "acao", id: ACAO_ATIVAR, rotulo: "Ativar", icone: Play },
    { tipo: "separador", id: "sep" },
    {
      tipo: "acao",
      id: ACAO_EXCLUIR,
      rotulo: "Excluir…",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Excluir esta regra?",
        descricao: "Os lançamentos que ela já preencheu não mudam. Daqui para frente ela deixa de valer.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
  return limparSeparadores(itens);
}

/** Item dos menus de lançamento (livro caixa, Contas, Pagas): vira regra a partir do lançamento. */
export const ACAO_CRIAR_REGRA = "criar-regra";
export const MOTIVO_SEM_CATEGORIA = "Escolha uma categoria no lançamento antes de criar a regra.";

export function itemCriarRegra(temCategoria: boolean): AcaoItem {
  return {
    tipo: "acao",
    id: ACAO_CRIAR_REGRA,
    rotulo: "Criar regra a partir deste lançamento…",
    icone: WandSparkles,
    desabilitado: temCategoria ? undefined : MOTIVO_SEM_CATEGORIA,
  };
}
