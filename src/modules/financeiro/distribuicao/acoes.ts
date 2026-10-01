import { CopyPlus, Pencil, Power, PowerOff, Star, Trash2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma regra de distribuição (ADR-0002) — **puro**. Mesmo array no menu de contexto e no `...`.
 * O que o perfil não permite some; o que o ESTADO impede fica desabilitado com a mesma frase que o
 * servidor devolveria.
 */

export const ACAO_EDITAR = "editar";
export const ACAO_DUPLICAR = "duplicar";
export const ACAO_ATIVAR = "ativar";
export const ACAO_DESATIVAR = "desativar";
export const ACAO_PADRAO = "padrao";
export const ACAO_EXCLUIR = "excluir";

export const MOTIVO_PADRAO_INATIVA = "A regra padrão não pode ficar inativa: torne outra regra padrão antes.";
export const MOTIVO_ATIVAR_ANTES = "Ative a regra antes de torná-la padrão.";
export const MOTIVO_USADA = "Já foi usada numa distribuição. Deixe inativa para manter o histórico.";
export const MOTIVO_EXCLUIR_PADRAO = "Torne outra regra padrão antes de excluir esta.";

export type RegraParaAcoes = { nome: string; ativa: boolean; padrao: boolean; usos: number };
export type ContextoRegra = { podeGerir: boolean; totalDeRegras: number };

export function itensDeRegra(r: RegraParaAcoes, ctx: ContextoRegra): AcaoItem[] {
  if (!ctx.podeGerir) return [];
  const excluirBloqueio = r.usos > 0 ? MOTIVO_USADA : r.padrao && ctx.totalDeRegras > 1 ? MOTIVO_EXCLUIR_PADRAO : undefined;
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil },
    { tipo: "acao", id: ACAO_DUPLICAR, rotulo: "Duplicar", icone: CopyPlus },
    r.ativa
      ? { tipo: "acao", id: ACAO_DESATIVAR, rotulo: "Deixar inativa", icone: PowerOff, desabilitado: r.padrao ? MOTIVO_PADRAO_INATIVA : undefined }
      : { tipo: "acao", id: ACAO_ATIVAR, rotulo: "Ativar", icone: Power },
    r.padrao ? null : { tipo: "acao", id: ACAO_PADRAO, rotulo: "Tornar padrão", icone: Star, desabilitado: r.ativa ? undefined : MOTIVO_ATIVAR_ANTES },
    { tipo: "separador", id: "sep" },
    {
      tipo: "acao",
      id: ACAO_EXCLUIR,
      rotulo: "Excluir…",
      icone: Trash2,
      variant: "destructive",
      desabilitado: excluirBloqueio,
      confirmar: { titulo: `Excluir a regra “${r.nome}”?`, descricao: "Ela nunca foi usada: nenhum histórico é perdido.", rotuloConfirmar: "Excluir" },
    },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
