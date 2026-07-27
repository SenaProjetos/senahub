/**
 * Gráfico do recalque por fatia: barras ρᵢ (mm) + linha do acréscimo de tensão Δσ (kPa).
 * Puro; retorna `<svg>` autocontido com cores fixas de impressão. Consumido via `MemoriaSecao.imagens`.
 */

type Fatia = { rhoMm: number; dSigmaKpa: number };

const f2 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function svgRecalqueFatias(fatias: readonly Fatia[]): string {
  const W = 720;
  const H = 300;
  const pad = 48;
  const y0 = 240; // linha de base
  const alturaMax = 150;
  const n = Math.max(fatias.length, 1);
  const maxRho = Math.max(...fatias.map((f) => f.rhoMm), 1e-6);
  const maxDs = Math.max(...fatias.map((f) => f.dSigmaKpa), 1e-6);
  const passo = (W - 2 * pad) / n;
  const bw = Math.max(passo - 12, 2);

  let barras = "";
  let curva = "";
  fatias.forEach((f, i) => {
    const x = pad + i * passo + 6;
    const hh = (f.rhoMm / maxRho) * alturaMax;
    barras +=
      `<rect x="${x.toFixed(1)}" y="${(y0 - hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="#2563eb" opacity="0.85"/>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${(y0 - hh - 4).toFixed(1)}" fill="#2563eb" font-size="10" text-anchor="middle">${f2(f.rhoMm)}</text>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${(y0 + 14).toFixed(1)}" fill="#475569" font-size="10" text-anchor="middle">F${i + 1}</text>`;
    curva += `${i ? "L" : "M"}${(x + bw / 2).toFixed(1)},${(y0 - (f.dSigmaKpa / maxDs) * alturaMax).toFixed(1)}`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" xmlns="http://www.w3.org/2000/svg" style="background:#fff">
    <text x="${W / 2}" y="20" fill="#b45309" font-size="12" font-weight="bold" text-anchor="middle">Recalque ρᵢ por fatia (mm) — barras; acréscimo Δσ (kPa) — linha</text>
    ${barras}
    ${curva ? `<path d="${curva}" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="5 3"/>` : ""}
    <line x1="${pad - 8}" y1="${y0}" x2="${W - pad + 8}" y2="${y0}" stroke="#334155"/>
    <text x="${W / 2}" y="${H - 8}" fill="#475569" font-size="11" text-anchor="middle">Fatias abaixo da base da sapata</text>
  </svg>`;
}
