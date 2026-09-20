import { Copy, ExternalLink, Pencil, Power, PowerOff } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha da lista de clientes — **puro**. O mesmo array alimenta o menu de contexto, o
 * `...` e a barra de seleção (ADR-0002, regra 2). Os gates daqui só escondem itens; o gate real
 * segue nas actions.
 */

export const ACAO_EDITAR = "editar";
export const ACAO_ALTERNAR_ATIVO = "alternar-ativo";
export const ACAO_COPIAR_NOME = "copiar-nome";
export const ACAO_COPIAR_DOCUMENTO = "copiar-documento";
export const ACAO_COPIAR_EMAIL = "copiar-email";
export const ACAO_LOTE_DESATIVAR = "lote-desativar";
export const ACAO_LOTE_REATIVAR = "lote-reativar";

export type ClienteParaAcoes = {
  id: string;
  ativo: boolean;
  documento: string | null;
  email: string | null;
};

export function itensDeCliente(c: ClienteParaAcoes, ctx: { podeGerir: boolean }): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    // Repõe o "abrir em nova aba" / "copiar endereço" do link do nome, que o botão direito tomaria.
    { tipo: "link", id: "abrir", rotulo: "Abrir cliente", icone: ExternalLink, href: `/clientes/${c.id}` },
    { tipo: "link", id: "abrir-nova-aba", rotulo: "Abrir em nova aba", icone: ExternalLink, href: `/clientes/${c.id}`, novaAba: true },
    ctx.podeGerir ? { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_ALTERNAR_ATIVO,
          rotulo: c.ativo ? "Desativar" : "Reativar",
          icone: c.ativo ? PowerOff : Power,
        }
      : null,
    { tipo: "separador", id: "sep-copiar" },
    { tipo: "acao", id: ACAO_COPIAR_NOME, rotulo: "Copiar nome", icone: Copy },
    c.documento ? { tipo: "acao", id: ACAO_COPIAR_DOCUMENTO, rotulo: "Copiar documento", icone: Copy } : null,
    c.email ? { tipo: "acao", id: ACAO_COPIAR_EMAIL, rotulo: "Copiar e-mail", icone: Copy } : null,
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}

/**
 * Lote: desativar/reativar por id. O estado dos selecionados que estão fora da página não é
 * conhecido aqui, então os dois são oferecidos e a action de UM cliente devolve o motivo de quem
 * já estava no estado pedido.
 */
export function itensDeLoteClientes(ctx: { podeGerir: boolean }): AcaoItem[] {
  if (!ctx.podeGerir) return [];
  return [
    { tipo: "acao", id: ACAO_LOTE_DESATIVAR, rotulo: "Desativar", icone: PowerOff },
    { tipo: "acao", id: ACAO_LOTE_REATIVAR, rotulo: "Reativar", icone: Power },
  ];
}
