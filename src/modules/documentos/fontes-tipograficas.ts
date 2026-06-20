/**
 * Registry de famílias tipográficas dos documentos (módulo PURO — sem
 * server-only; usado no editor client e no render server/PDF).
 *
 * `id`  → guardado em `estilo.fontFamily` do elemento.
 * `css` → valor aplicado em `font-family` (CSS).
 * Catálogo inicial: sans da marca, mono da marca e uma serifada p/ contratos.
 */

export type FonteTipografica = { id: string; label: string; css: string };

export const FONTES_TIPOGRAFICAS: FonteTipografica[] = [
  {
    id: "schibsted-grotesk",
    label: "Schibsted Grotesk (sans da marca)",
    css: "var(--font-schibsted-grotesk), system-ui, sans-serif",
  },
  {
    id: "red-hat-mono",
    label: "Red Hat Mono (mono)",
    css: "var(--font-red-hat-mono), ui-monospace, monospace",
  },
  {
    id: "serifada",
    label: "Serifada (contratos)",
    css: "Georgia, 'Times New Roman', serif",
  },
];

/** Resolve o `font-family` CSS de um id; "" / desconhecido → undefined (herda). */
export function fonteCss(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return FONTES_TIPOGRAFICAS.find((f) => f.id === id)?.css;
}
