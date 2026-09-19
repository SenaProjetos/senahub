import { Archive, ArrowRightLeft, Copy, Eye } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import {
  MOTIVO_BLOQUEADA,
  MOTIVO_NAO_EDITA,
  podeEditarTarefa,
  podeMoverTarefa,
  type TarefaParaRegra,
} from "@/modules/tarefas/regras";

/**
 * Descritor das ações de uma tarefa — **puro**, sem React e sem I/O, para ser testado por
 * unidade. Quem liga cada `id` a uma action é `useAcoesTarefa`.
 *
 * O mesmo array alimenta o menu de contexto do card/linha e o `...` (regra 2 da ADR-0002).
 */

export const ACAO_ABRIR = "abrir";
export const ACAO_COPIAR_TITULO = "copiar-titulo";
export const ACAO_ARQUIVAR = "arquivar";
/** "mover:<statusId>" — um item por coluna de destino. */
export const PREFIXO_MOVER = "mover:";

/** Extrai o status de destino de um id de "Mover para"; `null` se não for esse item. */
export function statusDoMover(idDaAcao: string): string | null {
  return idDaAcao.startsWith(PREFIXO_MOVER) ? idDaAcao.slice(PREFIXO_MOVER.length) : null;
}

export type TarefaParaAcoes = TarefaParaRegra & {
  id: string;
  titulo: string;
  statusId: string;
  /** Tem dependência em aberto: não entra em coluna concluída. */
  bloqueada: boolean;
};

export type ContextoAcoesTarefa = {
  meId: string;
  /** `tarefas:gerir_todas`, resolvido no servidor. */
  gereTodas: boolean;
  colunas: readonly { id: string; nome: string; concluido: boolean }[];
};

export function itensDeTarefa(t: TarefaParaAcoes, ctx: ContextoAcoesTarefa): AcaoItem[] {
  const podeMover = podeMoverTarefa(t, ctx.meId, ctx.gereTodas);
  const podeEditar = podeEditarTarefa(t, ctx.meId, ctx.gereTodas);
  const destinos = ctx.colunas.filter((c) => c.id !== t.statusId);

  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_ABRIR, rotulo: "Abrir", icone: Eye },

    // Escondido por PERFIL (regra 5): quem não move não vê o submenu.
    podeMover && destinos.length > 0
      ? {
          tipo: "sub",
          id: "mover",
          rotulo: "Mover para",
          icone: ArrowRightLeft,
          itens: destinos.map((c) => ({
            tipo: "acao",
            id: PREFIXO_MOVER + c.id,
            rotulo: c.nome,
            // Desabilitado pelo ESTADO da entidade, com o motivo do servidor à vista.
            desabilitado: t.bloqueada && c.concluido ? MOTIVO_BLOQUEADA : undefined,
          })),
        }
      : null,

    // Reposição do "Copiar" que o menu nativo dava no texto do card (regra 1).
    { tipo: "acao", id: ACAO_COPIAR_TITULO, rotulo: "Copiar título", icone: Copy },

    { tipo: "separador", id: "sep-destrutivas" },

    {
      tipo: "acao",
      id: ACAO_ARQUIVAR,
      rotulo: "Arquivar",
      icone: Archive,
      variant: "destructive",
      desabilitado: podeEditar ? undefined : MOTIVO_NAO_EDITA,
      confirmar: {
        titulo: "Arquivar tarefa?",
        descricao: `"${t.titulo}" sai do quadro e das listas. O histórico é mantido.`,
        rotuloConfirmar: "Arquivar",
      },
    },
  ];

  return limparSeparadores(itens.filter((i) => i !== null));
}
