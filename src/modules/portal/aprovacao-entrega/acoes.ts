import { Ban, FileCheck2, FileSearch, Undo2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import type { AprovacaoDTO } from "./queries";
import { MOTIVO_DESATUALIZADO_EQUIPE } from "./regras";

/**
 * Ações de um pedido de aprovação de entrega na aba Cliente do projeto — **puro** (ADR-0002). O mesmo array alimenta o
 * menu de contexto da linha e o `...`. O gate real é o serviço (audiência da conversa); aqui só o estado decide.
 * "Anular" é destrutivo e o diálogo do motivo é a confirmação dele.
 */

export const ACAO_REGISTRAR_POR_FORA = "registrar-por-fora";
export const ACAO_CANCELAR = "cancelar-aprovacao";
export const ACAO_ANULAR = "anular-resposta";
export const ACAO_VER_COMPROVANTE = "ver-comprovante";

export const hrefDoComprovante = (comprovanteId: string) =>
  `/api/portal/aprovacoes/comprovantes/${encodeURIComponent(comprovanteId)}?disposition=inline`;

export function itensDaAprovacao(a: Pick<AprovacaoDTO, "id" | "status" | "desatualizado" | "respostas">): AcaoItem[] {
  if (a.status === "aguardando") {
    return [
      {
        tipo: "acao",
        id: ACAO_REGISTRAR_POR_FORA,
        rotulo: "Registrar resposta recebida por fora",
        icone: FileCheck2,
        ...(a.desatualizado ? { desabilitado: MOTIVO_DESATUALIZADO_EQUIPE } : {}),
      },
      {
        tipo: "acao",
        id: ACAO_CANCELAR,
        rotulo: "Cancelar pedido",
        icone: Ban,
        variant: "destructive",
        confirmar: {
          titulo: "Cancelar este pedido de aprovação?",
          descricao: "O cliente deixa de ver o pedido no portal. Para mudar alguma coisa, envie um pedido novo.",
          rotuloConfirmar: "Cancelar pedido",
        },
      },
    ];
  }
  if (a.status === "respondido") {
    const ativa = a.respostas.find((r) => r.anulada === null);
    const itens: AcaoItem[] = [{ tipo: "acao", id: ACAO_ANULAR, rotulo: "Anular resposta", icone: Undo2, variant: "destructive" }];
    if (ativa?.comprovante) {
      itens.push({
        tipo: "link",
        id: ACAO_VER_COMPROVANTE,
        rotulo: "Ver comprovante",
        icone: FileSearch,
        href: hrefDoComprovante(ativa.comprovante.id),
        novaAba: true,
      });
    }
    return itens;
  }
  return [];
}
