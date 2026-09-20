import { Copy, ExternalLink, Eye, KeyRound } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha do cofre de acessos — **puro**. O mesmo array alimenta o menu de contexto e o
 * `...` (ADR-0002, regra 2).
 *
 * **A senha nunca sai por aqui.** "Ver credencial" só abre o drawer, e revelar é lá, numa ação
 * auditada (§16/§45). O login ("Copiar usuário") já aparece na tabela para quem tem permissão
 * naquele registro, então copiá-lo não expõe nada a mais — e quem não tem, recebe `usuario: null`
 * do servidor e não vê o item.
 *
 * Não há ação em lote: as únicas ações são abrir e copiar, que não se repetem sobre vários itens,
 * então a tabela não ganha caixa de seleção.
 */

export const ACAO_ABRIR = "abrir";
export const ACAO_PORTAL = "portal";
export const ACAO_CREDENCIAL = "credencial";
export const ACAO_COPIAR_USUARIO = "copiar-usuario";

export type AcessoParaAcoes = { url: string | null; usuario: string | null };

/**
 * Só `http(s)` vira link. O endereço vem do cadastro (texto livre): um `javascript:` ali, clicado
 * a partir de um menu do próprio sistema, executaria no contexto dele.
 */
export function urlDoPortal(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Sem nenhum item além de "Abrir detalhes", a lista volta vazia: linha com uma ação só não ganha
 * menu (ADR-0002, regra 4) — o botão "Ver" da linha já faz isso.
 */
export function itensDeAcesso(a: AcessoParaAcoes, ctx: { podeRevelar: boolean }): AcaoItem[] {
  const portal = urlDoPortal(a.url);
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_ABRIR, rotulo: "Abrir detalhes", icone: Eye },
    portal
      ? { tipo: "link", id: ACAO_PORTAL, rotulo: "Abrir portal", icone: ExternalLink, href: portal, novaAba: true }
      : null,
    ctx.podeRevelar ? { tipo: "acao", id: ACAO_CREDENCIAL, rotulo: "Ver credencial", icone: KeyRound } : null,
    a.usuario ? { tipo: "separador", id: "sep-copiar" } : null,
    a.usuario ? { tipo: "acao", id: ACAO_COPIAR_USUARIO, rotulo: "Copiar usuário", icone: Copy } : null,
  ];
  const lista = itens.filter((i): i is AcaoItem => i !== null);
  return lista.filter((i) => i.tipo !== "separador").length > 1 ? lista : [];
}
