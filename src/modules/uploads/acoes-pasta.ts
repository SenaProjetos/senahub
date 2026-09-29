import { Download, ExternalLink, FolderOpen, Link2 } from "lucide-react";
import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma pasta na lista de documentos (ADR-0002) — dado puro: o mesmo array alimenta o
 * botão direito e o `...` da linha.
 *
 * O nome da pasta é um link de verdade; o menu próprio suprime o nativo, então repõe o que ele
 * dava ali (abrir em nova aba, copiar o endereço). "Abrir" é ação, não link: navegar pelo
 * roteador mantém a tela sem recarregar, como o clique na linha.
 */
export const ACAO_ABRIR_PASTA = "abrir-pasta";
export const ACAO_COPIAR_LINK_PASTA = "copiar-link-pasta";

export function itensDePasta(ctx: { href: string; hrefZip: string | null }): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_ABRIR_PASTA, rotulo: "Abrir", icone: FolderOpen },
    { tipo: "link", id: "abrir-pasta-nova-aba", rotulo: "Abrir em nova aba", icone: ExternalLink, href: ctx.href, novaAba: true },
    { tipo: "acao", id: ACAO_COPIAR_LINK_PASTA, rotulo: "Copiar link", icone: Link2 },
    { tipo: "separador", id: "sep-baixar" },
    ctx.hrefZip ? { tipo: "link", id: "baixar-pasta", rotulo: "Baixar pasta (.zip)", icone: Download, href: ctx.hrefZip } : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
