/**
 * Sanitizador de SVG para ícones de disciplina enviados pelo admin.
 * Puro (sem DOM) — roda no servidor (autoritativo) e pode rodar no cliente.
 *
 * O SVG é renderizado via `<img src={dataURI}>` (nunca `dangerouslySetInnerHTML`),
 * então script embutido já não executa; esta função é a segunda camada: remove
 * vetores óbvios de XSS e limita o tamanho. Retorna o SVG limpo ou `null` se o
 * conteúdo não for um SVG válido / seguro / dentro do limite.
 */

/** Limite de tamanho do markup do ícone (20 KB). Ícone de UI não precisa de mais. */
export const SVG_MAX_BYTES = 20 * 1024;

function stripHrefsExternos(svg: string): string {
  // Mantém só refs de fragmento (#id, ex.: <use href="#a">); remove qualquer outra
  // (javascript:, http(s):, //host, data:) — attrs `href` e `xlink:href`.
  return svg.replace(
    /\s(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (m, _all, dq, sq, uq) => {
      const val = String(dq ?? sq ?? uq ?? "").trim();
      return val.startsWith("#") ? m : "";
    },
  );
}

export function sanitizeSvg(input: string | null | undefined): string | null {
  if (!input) return null;
  if (Buffer.byteLength(input, "utf8") > SVG_MAX_BYTES) return null;

  let svg = input.trim();

  // Prolog XML, DOCTYPE (com possíveis <!ENTITY>) e comentários fora.
  svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, "");
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");

  // Elementos perigosos, com conteúdo.
  svg = svg.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  svg = svg.replace(/<script\b[^>]*\/?>/gi, "");
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");
  svg = svg.replace(/<style[\s\S]*?<\/style\s*>/gi, "");

  // Handlers de evento (onload, onclick, …), aspas duplas/simples/sem aspas.
  svg = svg.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");

  // Refs externas.
  svg = stripHrefsExternos(svg);

  // Precisa sobrar uma raiz <svg>…</svg>.
  const start = svg.search(/<svg[\s>]/i);
  if (start === -1) return null;
  svg = svg.slice(start).trim();
  if (!/<svg[\s\S]*<\/svg\s*>/i.test(svg)) return null;

  return svg;
}
