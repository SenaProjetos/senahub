import { Pencil, Play, Power, PowerOff, Trash2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de um compromisso recorrente (ADR-0002) — **puro**. Mesmo array no menu de contexto e no `...`.
 * O que o perfil não permite some; o que o ESTADO impede fica desabilitado com a frase do servidor.
 */

export const ACAO_EDITAR = "editar";
export const ACAO_GERAR = "gerar";
export const ACAO_ATIVAR = "ativar";
export const ACAO_DESATIVAR = "desativar";
export const ACAO_EXCLUIR = "excluir";

export const MOTIVO_JA_GEROU = "Já gerou lançamentos. Deixe inativo para manter a origem deles.";
export const MOTIVO_INATIVO = "Compromisso inativo: ative antes de gerar.";

export type CompromissoParaAcoes = { descricao: string; ativo: boolean; gerados: number };
export type ContextoCompromisso = { podeGerir: boolean };

export function itensDeCompromisso(c: CompromissoParaAcoes, ctx: ContextoCompromisso): AcaoItem[] {
  if (!ctx.podeGerir) return [];
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil },
    { tipo: "acao", id: ACAO_GERAR, rotulo: "Gerar o que já venceu", icone: Play, desabilitado: c.ativo ? undefined : MOTIVO_INATIVO },
    c.ativo
      ? { tipo: "acao", id: ACAO_DESATIVAR, rotulo: "Deixar inativo", icone: PowerOff }
      : { tipo: "acao", id: ACAO_ATIVAR, rotulo: "Ativar", icone: Power },
    { tipo: "separador", id: "sep" },
    {
      tipo: "acao",
      id: ACAO_EXCLUIR,
      rotulo: "Excluir…",
      icone: Trash2,
      variant: "destructive",
      desabilitado: c.gerados > 0 ? MOTIVO_JA_GEROU : undefined,
      confirmar: {
        titulo: `Excluir o compromisso “${c.descricao}”?`,
        descricao: "Ele nunca gerou lançamento: nenhum histórico é perdido.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
