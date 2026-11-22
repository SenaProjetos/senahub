import { BookmarkCheck, BookmarkX } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import type { MensagemDTO } from "./queries";

/**
 * Ações de uma mensagem da conversa do portal, na aba Cliente do projeto — **puro** (ADR-0002). Uma ação por vez
 * (marcar OU remover a marca de decisão), então a mensagem não ganha menu de contexto (regra 4, e o texto corrido da
 * conversa mantém o menu do navegador — copiar, traduzir); o `...` da mensagem é o caminho. O gate real é o serviço.
 */

export const ACAO_MARCAR_DECISAO = "marcar-decisao";
export const ACAO_REMOVER_DECISAO = "remover-decisao";

export function itensDaMensagem(m: Pick<MensagemDTO, "decisao">, ctx: { podeDecidir: boolean }): AcaoItem[] {
  if (!ctx.podeDecidir) return [];
  if (m.decisao) {
    return [
      {
        tipo: "acao",
        id: ACAO_REMOVER_DECISAO,
        rotulo: "Remover marca de decisão",
        icone: BookmarkX,
        variant: "destructive",
        confirmar: {
          titulo: "Remover a marca de decisão?",
          descricao: "A mensagem continua na conversa; ela só sai da lista de Decisões, também no portal do cliente.",
          rotuloConfirmar: "Remover marca",
        },
      },
    ];
  }
  return [{ tipo: "acao", id: ACAO_MARCAR_DECISAO, rotulo: "Marcar como decisão do cliente", icone: BookmarkCheck }];
}
