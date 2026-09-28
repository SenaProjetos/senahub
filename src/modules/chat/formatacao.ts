/**
 * Formatação inline do chat (negrito / itálico / sublinhado), estilo WhatsApp.
 * Módulo puro (sem server-only/prisma) para ser testável e usado tanto no
 * cliente (render) quanto no servidor (texto puro da notificação/prévia).
 *
 * Sintaxe:
 *   *negrito*      → negrito
 *   _itálico_      → itálico
 *   ~sublinhado~   → sublinhado
 *   `destaque`     → realce (marca-texto); literal, não reinterpreta marcadores
 *
 * Regras (como no WhatsApp): o conteúdo entre marcadores não pode começar nem
 * terminar com espaço e não pode conter o próprio marcador. Marcadores podem
 * ser aninhados (ex.: `*_texto_*` = negrito + itálico).
 */

export type SegmentoFormatado = {
  texto: string;
  negrito: boolean;
  italico: boolean;
  sublinhado: boolean;
  codigo: boolean;
};

type ChaveFormato = "negrito" | "italico" | "sublinhado" | "codigo";
type Marcador = { char: string; chave: ChaveFormato };

const MARCADORES: Marcador[] = [
  { char: "*", chave: "negrito" },
  { char: "_", chave: "italico" },
  { char: "~", chave: "sublinhado" },
  { char: "`", chave: "codigo" },
];

const FLAGS_ZERO: Record<ChaveFormato, boolean> = {
  negrito: false,
  italico: false,
  sublinhado: false,
  codigo: false,
};

/** Constrói a regex de um marcador (conteúdo sem espaço nas pontas nem o marcador). */
function regexMarcador(char: string): RegExp {
  const fora = char === "*" ? "\\*" : char; // '*' precisa de escape fora da classe
  const c = char; // '*', '_', '~' são literais dentro de [ ]
  return new RegExp(`${fora}([^\\s${c}]|[^\\s${c}][^${c}]*?[^\\s${c}])${fora}`);
}

const REGEX: Record<string, RegExp> = Object.fromEntries(
  MARCADORES.map((m) => [m.char, regexMarcador(m.char)]),
);

function parseRec(texto: string, flags: Record<ChaveFormato, boolean>): SegmentoFormatado[] {
  let melhor: { m: Marcador; match: RegExpExecArray } | null = null;
  for (const m of MARCADORES) {
    if (flags[m.chave]) continue; // já dentro desse marcador
    const match = REGEX[m.char].exec(texto);
    if (match && (!melhor || match.index < melhor.match.index)) melhor = { m, match };
  }
  if (!melhor) return texto ? [{ texto, ...flags }] : [];
  const { m, match } = melhor;
  const antes = texto.slice(0, match.index);
  const depois = texto.slice(match.index + match[0].length);
  // Destaque é literal: não reinterpreta marcadores no seu interior (como no Markdown).
  const dentro =
    m.chave === "codigo"
      ? [{ texto: match[1], ...flags, codigo: true }]
      : parseRec(match[1], { ...flags, [m.chave]: true });
  return [
    ...(antes ? [{ texto: antes, ...flags }] : []),
    ...dentro,
    ...parseRec(depois, flags),
  ];
}

/** Divide o texto em segmentos com as flags de formatação aplicadas a cada trecho. */
export function parseFormatacao(texto: string): SegmentoFormatado[] {
  return parseRec(texto, FLAGS_ZERO);
}

/** Remove os marcadores, devolvendo o texto puro (para prévia/notificação/busca). */
export function removerFormatacao(texto: string): string {
  return parseFormatacao(texto)
    .map((s) => s.texto)
    .join("");
}

/**
 * Referências internas: sintaxe Markdown-link restrita a caminhos internos —
 * `[rótulo](/projetos/ID)`. Usada para inserir menções a Projeto/Documento no chat.
 *
 * `//host` e `/\host` ficam de fora: o navegador lê os dois como endereço de OUTRO site, e o
 * rótulo esconderia o destino de quem clica — um link externo disfarçado de projeto.
 */
const REGEX_REFERENCIA = /\[([^\]\n]+)\]\((\/(?![/\\])[^)\s]*)\)/g;

/**
 * Endereço colado no texto (`https://…`, `http://…` ou `www.…`). Só esses dois esquemas: nada
 * de `javascript:`/`data:` virando link. O texto mostrado é o próprio endereço, então quem clica
 * vê para onde vai.
 */
const REGEX_URL = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** Pontuação que encerra a frase, não o endereço: "veja https://x.com." */
const PONTUACAO_FINAL = /[.,;:!?'"*_~]+$/;

export type ParteTexto =
  | { tipo: "texto"; texto: string }
  | { tipo: "link"; label: string; href: string }
  | { tipo: "url"; texto: string; href: string };

/**
 * Tira do fim do endereço o que é da frase: pontuação e o `)` de quem escreveu o link entre
 * parênteses. Parêntese que abre DENTRO do endereço (Wikipédia) fica, porque está equilibrado.
 */
function aparaFimDaUrl(url: string): string {
  let u = url;
  for (;;) {
    const semPontuacao = u.replace(PONTUACAO_FINAL, "");
    if (semPontuacao !== u) {
      u = semPontuacao;
      continue;
    }
    const fim = u.at(-1);
    const par = fim === ")" ? "(" : fim === "]" ? "[" : null;
    if (par && u.split(par).length < u.split(fim!).length) {
      u = u.slice(0, -1);
      continue;
    }
    return u;
  }
}

/** Separa os endereços colados do texto comum. */
function partesComUrl(texto: string): ParteTexto[] {
  const out: ParteTexto[] = [];
  let last = 0;
  for (const m of texto.matchAll(REGEX_URL)) {
    const idx = m.index ?? 0;
    const url = aparaFimDaUrl(m[0]);
    // "www." sozinho (ou "https://" sem nada) não é endereço.
    if (!/^(?:https?:\/\/|www\.)[^./]/i.test(url)) continue;
    if (idx > last) out.push({ tipo: "texto", texto: texto.slice(last, idx) });
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    out.push({ tipo: "url", texto: url, href });
    last = idx + url.length;
  }
  if (last < texto.length) out.push({ tipo: "texto", texto: texto.slice(last) });
  return out;
}

/**
 * Divide o texto separando as referências internas e os endereços colados do texto normal.
 *
 * Os endereços saem ANTES da formatação de propósito: `_`, `*` e `~` são comuns em URL e, lidos
 * como marcador, quebrariam o endereço em itálico/negrito no meio.
 */
export function partesComLink(texto: string): ParteTexto[] {
  const out: ParteTexto[] = [];
  let last = 0;
  for (const m of texto.matchAll(REGEX_REFERENCIA)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...partesComUrl(texto.slice(last, idx)));
    out.push({ tipo: "link", label: m[1], href: m[2] });
    last = idx + m[0].length;
  }
  if (last < texto.length) out.push(...partesComUrl(texto.slice(last)));
  return out;
}

/** Troca as referências pelo seu rótulo (para prévia/notificação/busca). */
export function removerReferencias(texto: string): string {
  return texto.replace(REGEX_REFERENCIA, (_m, label) => label);
}

/** Texto limpo para prévia/notificação: sem marcadores e sem sintaxe de referência. */
export function textoParaPreview(texto: string): string {
  return removerFormatacao(removerReferencias(texto));
}
