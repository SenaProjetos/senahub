"use client";

import { CorpoAviso } from "@/components/notificacoes/corpo-aviso";

/**
 * Texto da ata (markdown leve) — o mesmo render do corpo dos Avisos: sem HTML cru, link vira texto, imagem some
 * (`corpo-aviso-markdown.tsx`), carregado sob demanda. Usado no portal, na aba Cliente e na prévia do editor.
 */
export function TextoAta({ texto, className }: { texto: string; className?: string }) {
  if (!texto.trim()) return null;
  return <CorpoAviso corpo={texto} className={className} />;
}
