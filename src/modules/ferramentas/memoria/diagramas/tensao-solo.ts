/**
 * Diagrama de tensões no solo sob a base da sapata (trapezoidal ou triangular).
 * Puro: retorna `<svg>` autocontido, sem dependência externa, com cores fixas de impressão
 * (o PDF é sempre em fundo claro). Consumido via `MemoriaSecao.imagens`.
 */

type Args = {
  /** Dimensão da base na direção do momento, cm. */
  a: number;
  /** Tensão na borda mais carregada, kPa. */
  sigmaMax: number;
  /** Tensão na borda menos carregada, kPa (0 quando descola). */
  sigmaMin: number;
  /** true = diagrama triangular com descolamento (e > a/6). */
  descola: boolean;
  /** Comprimento de contato x = 3·(a/2 − e), cm. Só usado quando `descola`. */
  xContatoCm?: number;
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function svgTensaoSolo({ a, sigmaMax, sigmaMin, descola, xContatoCm }: Args): string {
  const W = 460;
  const H = 220;
  const x0 = 60;
  const y0 = 60; // face inferior da sapata (topo do diagrama)
  const baseW = W - 2 * x0;
  const sc = 90 / Math.max(sigmaMax, 0.001); // escala vertical: σmax ocupa 90 px
  const y1 = y0 + Math.max(sigmaMin, 0) * sc; // borda menos carregada
  const y2 = y0 + Math.max(sigmaMax, 0) * sc; // borda mais carregada

  // Fração da base em contato: 3·(a/2 − e)/a quando conhecida; senão, proporção ilustrativa.
  const frac = descola ? Math.min(Math.max((xContatoCm ?? 0.66 * a) / Math.max(a, 0.001), 0.05), 1) : 1;
  const xFim = x0 + baseW * frac;

  const diagrama = descola
    ? `<polygon points="${x0},${y0} ${x0},${y2} ${xFim},${y0}" fill="#dc262633" stroke="#dc2626" stroke-width="2"/>`
    : `<polygon points="${x0},${y0} ${x0},${y1} ${x0 + baseW},${y2} ${x0 + baseW},${y0}" fill="#dc262633" stroke="#dc2626" stroke-width="2"/>`;

  const rotuloContato = descola
    ? `<text x="${(x0 + xFim) / 2}" y="${y0 - 30}" fill="#475569" font-size="10" text-anchor="middle">contato x = ${fmt(frac * a)} cm</text>`
    : "";

  // Nota: no diagrama triangular a borda esquerda é a mais carregada (σmax) e a tensão cai a zero
  // no fim do trecho em contato; no trapezoidal, σmin fica na borda esquerda e σmax na direita.
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" xmlns="http://www.w3.org/2000/svg" style="background:#fff">
    <text x="${W / 2}" y="20" fill="#b45309" font-size="12" font-weight="bold" text-anchor="middle">Tensões na base do solo (kPa)</text>
    ${rotuloContato}
    <rect x="${x0}" y="${y0 - 24}" width="${baseW}" height="24" fill="#dbeafe" stroke="#334155" stroke-width="1.5"/>
    ${diagrama}
    <text x="${x0 - 6}" y="${(descola ? y2 : y1) + 12}" fill="#b91c1c" font-size="11" text-anchor="end">${descola ? `σmax = ${fmt(sigmaMax)}` : `σmin = ${fmt(sigmaMin)}`}</text>
    <text x="${x0 + baseW + 6}" y="${(descola ? y0 : y2) + 12}" fill="#b91c1c" font-size="11">${descola ? "σ = 0" : `σmax = ${fmt(sigmaMax)}`}</text>
    <text x="${W / 2}" y="${H - 8}" fill="#475569" font-size="11" text-anchor="middle">a = ${fmt(a)} cm</text>
  </svg>`;
}
