/**
 * Ações de um pedido "Atualize seus dados" (ADR-0002): dado puro, o mesmo array no menu de
 * contexto e no `...`. Estado que impede aparece desabilitado com a frase do servidor.
 */
import { BellRing, ExternalLink, XCircle } from "lucide-react";
import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

export const MOTIVO_SO_ABERTO_LEMBRA = "Só um pedido aberto recebe lembrete.";
export const MOTIVO_SO_ABERTO_CANCELA = "Só um pedido aberto pode ser cancelado.";

export function itensDoPedidoDados(
  pedido: { status: "aberto" | "atendido" | "cancelado"; userId: string },
  opcoes: { hrefFicha: boolean },
): AcaoItem[] {
  const fechado = pedido.status !== "aberto";
  return limparSeparadores([
    ...(opcoes.hrefFicha ? [{ tipo: "link" as const, id: "ficha", rotulo: "Abrir ficha da pessoa", icone: ExternalLink, href: `/rh/pessoas/${pedido.userId}` }] : []),
    { tipo: "separador", id: "s1" },
    { tipo: "acao", id: "lembrar", rotulo: "Reenviar lembrete", icone: BellRing, desabilitado: fechado ? MOTIVO_SO_ABERTO_LEMBRA : undefined },
    {
      tipo: "acao",
      id: "cancelar",
      rotulo: "Cancelar pedido",
      icone: XCircle,
      variant: "destructive",
      desabilitado: fechado ? MOTIVO_SO_ABERTO_CANCELA : undefined,
      confirmar: { titulo: "Cancelar este pedido?", descricao: "A faixa some para a pessoa. O que ela já preencheu fica.", rotuloConfirmar: "Cancelar pedido" },
    },
  ]);
}
