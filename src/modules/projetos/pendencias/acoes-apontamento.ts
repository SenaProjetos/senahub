import { Check, CopyPlus, MessageSquare, PauseCircle, Pencil, RotateCcw, Tags, Trash2, Undo2, Wrench, type LucideIcon } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import { rotuloRevisao } from "@/lib/utils";
import { STATUS_TERMINAIS, transicoesPossiveis, type PapeisPendencia, type StatusPendencia } from "./helpers";

/**
 * Ações de UM apontamento do visualizador de pranchas — **puro** (ADR-0002). O mesmo array
 * alimenta o menu de contexto da bolinha na prancha e os botões do painel "Detalhes do
 * apontamento": é assim que os dois caminhos oferecem sempre as mesmas coisas.
 *
 * Perfil que não pode → o item some; estado que impede → o item vem `desabilitado` com a MESMA
 * frase do `ActionError` do servidor. As mudanças de estado saem de `transicoesPossiveis`, a
 * máquina que a action usa para recusar — a tela nunca oferece o que o servidor nega.
 */

export const ACAO_RESPONDER = "responder";
export const ACAO_EDITAR = "editar";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_CLASSIFICAR = "classificar";
export const ACAO_REPLICAR = "replicar";
/** "Resolver" de apontamento herdado de revisão anterior: grava em qual revisão foi resolvido. */
export const ACAO_RESOLVER_NA_REVISAO = "resolver-na-revisao";
/** Prefixo das mudanças de estado: `estado:em_correcao`, `estado:fechada`… */
export const PREFIXO_ESTADO = "estado:";

/** Destino da mudança de estado de um item, ou `null` se o item não é uma. */
export function destinoDoItem(id: string): StatusPendencia | null {
  return id.startsWith(PREFIXO_ESTADO) ? (id.slice(PREFIXO_ESTADO.length) as StatusPendencia) : null;
}

export type ApontamentoParaAcoes = {
  numero: number;
  status: string;
  autorId: string | null;
  tarefaId: string | null;
  totalRespostas: number;
  deOutraRevisao: boolean;
  revisaoOrigemId: string | null;
};

export type ContextoAcoesApontamento = {
  papeis: PapeisPendencia;
  usuarioId: string;
  ehAdmin: boolean;
  /** `uploads:validar` — quem aponta também classifica e replica. */
  podeValidar: boolean;
  /** Há outra prancha vigente na disciplina para receber a cópia. */
  temPranchaParaReplicar: boolean;
  /** Revisão aberta agora (`null` em linha legada sem revisão lógica). */
  revisaoAtualId: string | null;
  revisaoAtualNumero: number;
};

type Transicao = { rotulo: string; icone: LucideIcon; dica: string };

/** Rótulo, ícone e dica de cada mudança de estado — `de` muda o sentido de "voltar a aberto". */
function transicao(destino: StatusPendencia, de: string): Transicao {
  switch (destino) {
    case "em_correcao":
      return { rotulo: "Assumir", icone: Wrench, dica: "Assume a correção: o apontamento passa para Em correção." };
    case "resolvida":
      return { rotulo: "Resolver", icone: Check, dica: "Marca como corrigido. Quem valida confere e fecha." };
    case "fechada":
      return { rotulo: "Fechar", icone: Check, dica: "Confirma a correção e encerra o apontamento." };
    case "descartada":
      return {
        rotulo: "Não procede",
        icone: RotateCcw,
        dica: "Encerra sem correção. Pede uma justificativa, que fica registrada para o projetista.",
      };
    case "adiado":
      return {
        rotulo: "Adiar",
        icone: PauseCircle,
        dica: "Tira o apontamento da rodada atual sem encerrá-lo. Pode ser reativado depois.",
      };
    case "aberta":
      if (de === "resolvida") {
        return { rotulo: "Reabrir", icone: Undo2, dica: "A correção não resolveu: o apontamento volta para Aberto." };
      }
      if (de === "adiado") {
        return { rotulo: "Reativar", icone: Undo2, dica: "Traz o apontamento adiado de volta para a fila (Aberto)." };
      }
      return { rotulo: "Voltar à fila", icone: Undo2, dica: "Desiste da correção e devolve o apontamento para a fila (Aberto)." };
  }
}

export function itensDoApontamento(p: ApontamentoParaAcoes, ctx: ContextoAcoesApontamento): AcaoItem[] {
  const terminal = STATUS_TERMINAIS.includes(p.status as StatusPendencia);
  const ehAutor = p.autorId === ctx.usuarioId || ctx.ehAdmin;
  const itens: (AcaoItem | null)[] = [
    {
      tipo: "acao",
      id: ACAO_RESPONDER,
      rotulo: p.totalRespostas > 0 ? `Responder (${p.totalRespostas})` : "Responder",
      icone: MessageSquare,
      dica: "Abre a conversa do apontamento: responda, anexe evidência ou ligue a outro apontamento. Use @nome para avisar alguém.",
    },
    ehAutor
      ? {
          tipo: "acao",
          id: ACAO_EDITAR,
          rotulo: "Editar",
          icone: Pencil,
          dica: "Altera a descrição e a classificação. Só enquanto está aberto e antes de virar tarefa.",
          desabilitado: p.tarefaId
            ? "Pendência já enviada como tarefa — não pode ser editada."
            : p.status !== "aberta"
              ? "Só pendências abertas podem ser editadas."
              : undefined,
        }
      : null,
    ...transicoesPossiveis(p.status, ctx.papeis).map((destino): AcaoItem => {
      // Herdado de outra revisão: "resolver" grava a revisão em que a correção apareceu.
      const naRevisao =
        destino === "resolvida" &&
        p.deOutraRevisao &&
        ctx.revisaoAtualId != null &&
        p.revisaoOrigemId != null &&
        p.revisaoOrigemId !== ctx.revisaoAtualId;
      if (naRevisao) {
        const rev = rotuloRevisao(ctx.revisaoAtualNumero);
        return {
          tipo: "acao",
          id: ACAO_RESOLVER_NA_REVISAO,
          rotulo: `Resolver na ${rev}`,
          icone: Check,
          dica: `Marca como corrigido nesta revisão (${rev}). Quem valida confere e fecha.`,
        };
      }
      const t = transicao(destino, p.status);
      return { tipo: "acao", id: `${PREFIXO_ESTADO}${destino}`, rotulo: t.rotulo, icone: t.icone, dica: t.dica };
    }),
    ctx.podeValidar
      ? {
          tipo: "acao",
          id: ACAO_CLASSIFICAR,
          rotulo: "Classificar",
          icone: Tags,
          dica: "Define severidade, tipo e prazo. Impeditivo trava a validação da prancha.",
          desabilitado: terminal ? "Pendência já encerrada — não pode ser reclassificada." : undefined,
        }
      : null,
    ctx.podeValidar && ctx.temPranchaParaReplicar
      ? {
          tipo: "acao",
          id: ACAO_REPLICAR,
          rotulo: "Replicar",
          icone: CopyPlus,
          dica: "Copia o apontamento (texto e posição) para outras pranchas da disciplina.",
        }
      : null,
    ehAutor ? { tipo: "separador", id: "sep-excluir" } : null,
    ehAutor
      ? {
          tipo: "acao",
          id: ACAO_EXCLUIR,
          rotulo: "Excluir",
          icone: Trash2,
          variant: "destructive",
          dica: "Apaga o apontamento. Só quem criou (ou admin), antes de virar tarefa.",
          desabilitado: p.tarefaId ? "Pendência já vinculada a uma tarefa — não pode ser excluída." : undefined,
          confirmar: {
            titulo: `Excluir o apontamento #${p.numero}?`,
            descricao: "Ele sai da prancha, da lista de tarefas do documento e do PDF carimbado.",
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}
