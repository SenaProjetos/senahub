import { Check, Copy, Paperclip, Pencil } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma conta a pagar/receber — **puro**. Mesmo array para o menu de contexto, o `...` e a
 * barra de seleção (ADR-0002, regra 2). O botão "Pagar"/"Receber" continua visível na linha (é a
 * ação primária do perfil, regra 3 do plano); aqui ele também está, para o menu de contexto ser
 * completo.
 */

export const ACAO_QUITAR = "quitar";
export const ACAO_EDITAR = "editar";
export const ACAO_ANEXOS = "anexos";
export const ACAO_COPIAR_DESCRICAO = "copiar-descricao";
export const ACAO_LOTE_QUITAR = "lote-quitar";

/** Mesmo texto do aviso que a tela já dava ao clicar em pagar uma despesa ainda não aprovada. */
export const MOTIVO_AGUARDANDO_APROVACAO = "Despesa aguardando aprovação.";

export type ContaParaAcoes = {
  status: string;
  anexos: number;
};

export type ContextoAcoesConta = {
  /** Aba: despesa paga, receita recebe. */
  tipo: "despesa" | "receita";
  /** Editar e ver anexos são de quem gere o financeiro; quem só vê não os recebe. */
  podeGerir: boolean;
};

const verbo = (tipo: "despesa" | "receita") => (tipo === "despesa" ? "Pagar" : "Receber");

export function itensDeConta(c: ContaParaAcoes, ctx: ContextoAcoesConta): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    {
      tipo: "acao",
      id: ACAO_QUITAR,
      rotulo: verbo(ctx.tipo),
      icone: Check,
      // Estado da entidade → desabilitado com o motivo (regra 5), o mesmo do aviso que já existia.
      desabilitado: c.status === "aguardando_aprovacao" ? MOTIVO_AGUARDANDO_APROVACAO : undefined,
    },
    ctx.podeGerir ? { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_ANEXOS,
          rotulo: c.anexos > 0 ? `Anexos (${c.anexos})` : "Anexos",
          icone: Paperclip,
        }
      : null,
    { tipo: "acao", id: ACAO_COPIAR_DESCRICAO, rotulo: "Copiar descrição", icone: Copy },
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}

/**
 * Lote: pagar/receber o que estiver selecionado. Abre o diálogo de conta/forma/data que já existia e
 * roda a ação atômica do servidor — por isso não passa pelo motor item a item.
 */
export function itensDeLoteContas(tipo: "despesa" | "receita"): AcaoItem[] {
  return [{ tipo: "acao", id: ACAO_LOTE_QUITAR, rotulo: verbo(tipo), icone: Check }];
}
