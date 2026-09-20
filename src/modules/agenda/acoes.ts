import { CalendarDays, CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações da agenda — **puro**. O mesmo array alimenta o menu de contexto e o `...` (ADR-0002,
 * regra 2). Quem liga cada `id` a uma action ou a um diálogo é `useAcoesCompromisso`.
 */

export const ACAO_EDITAR = "editar";
export const ACAO_DUPLICAR = "duplicar";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_NOVO_NO_DIA = "novo-no-dia";
export const ACAO_VER_DIA = "ver-dia";

export type CompromissoParaAcoes = { criadorId: string };

/**
 * Compromisso: editar e excluir são do criador (e do admin) — o servidor recusa os demais, então
 * aqui o item **some** (regra 5: o que o perfil não permite não entra na lista).
 *
 * Quem não é criador fica só com "Duplicar". Linha com uma ação só não ganha menu (ADR-0002,
 * regra 4): a lista volta vazia, e a tela deixa o botão direito para o navegador.
 */
export function itensDeCompromisso(
  c: CompromissoParaAcoes,
  ctx: { meId: string; ehAdmin: boolean },
): AcaoItem[] {
  const podeGerir = c.criadorId === ctx.meId || ctx.ehAdmin;
  if (!podeGerir) return [];
  return [
    { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil },
    { tipo: "acao", id: ACAO_DUPLICAR, rotulo: "Duplicar", icone: CopyPlus },
    { tipo: "separador", id: "sep-excluir" },
    {
      tipo: "acao",
      id: ACAO_EXCLUIR,
      rotulo: "Excluir",
      icone: Trash2,
      variant: "destructive",
      // Antes o botão de excluir agia direto, sem perguntar: regra 4 da ADR-0002.
      confirmar: {
        titulo: "Excluir este compromisso?",
        descricao: "Ele some da agenda de todos os convidados. Não pode ser desfeito.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}

/**
 * Um dia da agenda (célula do mês, coluna da semana). Não existe na vista diária: lá o menu teria
 * uma ação só ("Novo compromisso"), e linha de ação única não ganha menu (ADR-0002, regra 4).
 *
 * Sem botão próprio, como o menu da coluna nas tarefas: o botão "Novo compromisso" do topo e o
 * seletor de vista chegam ao mesmo lugar, e o menu só poupa um passo.
 */
export function itensDeDia(): AcaoItem[] {
  return [
    { tipo: "acao", id: ACAO_NOVO_NO_DIA, rotulo: "Novo compromisso neste dia", icone: Plus },
    { tipo: "acao", id: ACAO_VER_DIA, rotulo: "Ver este dia", icone: CalendarDays },
  ];
}
