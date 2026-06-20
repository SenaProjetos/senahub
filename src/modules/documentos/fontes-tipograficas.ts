/**
 * Registry de famílias tipográficas dos documentos (módulo PURO — sem
 * server-only; usado no editor client e no render server/PDF).
 *
 * `id`  → guardado em `estilo.fontFamily` do elemento.
 * `css` → valor aplicado em `font-family` (CSS).
 *
 * Catálogo curado cobrindo sans/serif/mono:
 *  - web-safe (não precisam carregar): Arial, Times New Roman, Georgia,
 *    Courier New, Verdana, Tahoma.
 *  - marca (carregadas via next/font no root layout): Schibsted Grotesk,
 *    Red Hat Mono.
 *  - Google Fonts (carregadas via <link> no layout do dashboard): Roboto,
 *    Lora, Montserrat, Source Serif 4.
 *
 * O admin escolhe quais ficam habilitadas (Configurações → Documentos),
 * persistido em ConfigSistema. Ver `fontesHabilitadas()` (server) + filtro no
 * editor (client). Mexer aqui? Mantenha os ids das Google Fonts em sincronia
 * com o <link> de `GOOGLE_FONTS_HREF` abaixo.
 */

export type FonteTipografica = { id: string; label: string; css: string };

export const FONTES_TIPOGRAFICAS: FonteTipografica[] = [
  // — Marca —
  {
    id: "schibsted-grotesk",
    label: "Schibsted Grotesk (sans da marca)",
    css: "var(--font-schibsted-grotesk), system-ui, sans-serif",
  },
  {
    id: "red-hat-mono",
    label: "Red Hat Mono (mono da marca)",
    css: "var(--font-red-hat-mono), ui-monospace, monospace",
  },
  // — Web-safe (sem carregamento) —
  {
    id: "arial",
    label: "Arial / Helvetica (sans)",
    css: "Arial, Helvetica, sans-serif",
  },
  {
    id: "verdana",
    label: "Verdana (sans)",
    css: "Verdana, Geneva, sans-serif",
  },
  {
    id: "tahoma",
    label: "Tahoma (sans)",
    css: "Tahoma, Geneva, sans-serif",
  },
  {
    id: "times-new-roman",
    label: "Times New Roman (serif)",
    css: "'Times New Roman', Times, serif",
  },
  {
    id: "georgia",
    label: "Georgia (serif p/ contratos)",
    css: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "courier-new",
    label: "Courier New (mono)",
    css: "'Courier New', Courier, monospace",
  },
  // — Google Fonts (carregadas via <link>) —
  {
    id: "roboto",
    label: "Roboto (sans · Google)",
    css: "'Roboto', system-ui, sans-serif",
  },
  {
    id: "montserrat",
    label: "Montserrat (sans · Google)",
    css: "'Montserrat', system-ui, sans-serif",
  },
  {
    id: "lora",
    label: "Lora (serif · Google)",
    css: "'Lora', Georgia, serif",
  },
  {
    id: "source-serif-4",
    label: "Source Serif 4 (serif · Google)",
    css: "'Source Serif 4', Georgia, serif",
  },
];

/**
 * `<link href>` do Google Fonts cobrindo as famílias do catálogo que precisam
 * carregar (web-safe e marca ficam de fora). Use no layout do dashboard para
 * que renderizem no editor e no preview/PDF.
 */
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2" +
  "?family=Roboto:ital,wght@0,400;0,700;1,400;1,700" +
  "&family=Montserrat:ital,wght@0,400;0,700;1,400;1,700" +
  "&family=Lora:ital,wght@0,400;0,700;1,400;1,700" +
  "&family=Source+Serif+4:ital,wght@0,400;0,700;1,400;1,700" +
  "&display=swap";

/** Resolve o `font-family` CSS de um id; "" / desconhecido → undefined (herda). */
export function fonteCss(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return FONTES_TIPOGRAFICAS.find((f) => f.id === id)?.css;
}
