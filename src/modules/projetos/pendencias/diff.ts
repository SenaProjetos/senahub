/**
 * Diff automático entre revisões (item 6) — puro, sem DOM, no molde de `marcacao.ts`.
 *
 * Compara duas páginas JÁ RASTERIZADAS na mesma grade e devolve as regiões que mudaram. A
 * rasterização em si fica no cliente (é o pdf.js do comparador que já carrega as duas
 * revisões); aqui entra só o array de pixels, o que deixa o algoritmo testável sem canvas.
 *
 * **Por que pixel e não conteúdo do PDF:** exportador de CAD reescreve o stream inteiro a cada
 * gravação (IDs de objeto, compressão), então hash de conteúdo acusaria mudança em páginas
 * visualmente idênticas. Medido no protótipo: renderizar a MESMA página duas vezes pelo pdf.js
 * dá **zero** pixel diferente — a rasterização é determinística, então não há piso de ruído a
 * descontar. É o que torna o método viável.
 *
 * **Limite honesto:** isto detecta diferença de PIXEL, não de semântica. Um desenho deslocado
 * 2 mm acusa "tudo mudou" — a região reportada vira a união da posição velha com a nova. Numa
 * revisão que só reposicionou conteúdo, o resultado é uma banda larga, não um recorte fino.
 */

/** Lado do ladrilho em px. 16 dá recorte fino sem explodir a contagem numa prancha grande. */
export const TILE = 16;
/** Tolerância por canal RGB. Absorve resíduo de antialias sem deixar passar traço fino. */
export const TOLERANCIA = 12;
/** Acima disto a página é "muito alterada": vira resumo, não uma caixa por fragmento. */
export const LIMITE_REGIOES = 40;
export const LIMITE_AREA = 0.25;

export type RegiaoDiff = { x: number; y: number; largura: number; altura: number; tiles: number };

export type GradeDiff = {
  grade: Uint8Array;
  cols: number;
  rows: number;
  pixelsDiferentes: number;
  tilesAlterados: number;
};

/**
 * Marca quais ladrilhos diferem entre duas imagens RGBA do mesmo tamanho. `a`/`b` são o `data`
 * de um `ImageData` (4 bytes por pixel).
 */
export function compararTiles(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
  opts: { largura: number; altura: number; tile?: number; tolerancia?: number },
): GradeDiff {
  const tile = opts.tile ?? TILE;
  const tol = opts.tolerancia ?? TOLERANCIA;
  const { largura: W, altura: H } = opts;
  const cols = Math.ceil(W / tile);
  const rows = Math.ceil(H / tile);
  const grade = new Uint8Array(cols * rows);
  let pixelsDiferentes = 0;

  for (let y = 0; y < H; y++) {
    const linha = y * W;
    const faixa = Math.floor(y / tile) * cols;
    for (let x = 0; x < W; x++) {
      const i = (linha + x) * 4;
      // Só RGB: o alfa de um render de PDF é sempre opaco, e compará-lo só somaria ruído.
      if (
        Math.abs(a[i] - b[i]) > tol ||
        Math.abs(a[i + 1] - b[i + 1]) > tol ||
        Math.abs(a[i + 2] - b[i + 2]) > tol
      ) {
        pixelsDiferentes++;
        grade[faixa + Math.floor(x / tile)] = 1;
      }
    }
  }

  let tilesAlterados = 0;
  for (let k = 0; k < grade.length; k++) tilesAlterados += grade[k];
  return { grade, cols, rows, pixelsDiferentes, tilesAlterados };
}

/**
 * Agrupa ladrilhos alterados vizinhos (8-conectado) em regiões retangulares, da maior pra
 * menor. Pilha explícita em vez de recursão: numa prancha A1 uma região pode ter milhares de
 * ladrilhos e a recursão estouraria a pilha do JS.
 */
export function agruparRegioes(grade: Uint8Array, cols: number, rows: number, tile = TILE): RegiaoDiff[] {
  const visto = new Uint8Array(grade.length);
  const regioes: RegiaoDiff[] = [];

  for (let k = 0; k < grade.length; k++) {
    if (!grade[k] || visto[k]) continue;
    const pilha = [k];
    visto[k] = 1;
    let x0 = k % cols;
    let x1 = x0;
    let y0 = Math.floor(k / cols);
    let y1 = y0;
    let n = 0;

    while (pilha.length) {
      const cur = pilha.pop()!;
      const cx = cur % cols;
      const cy = Math.floor(cur / cols);
      n++;
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const nk = ny * cols + nx;
          if (grade[nk] && !visto[nk]) {
            visto[nk] = 1;
            pilha.push(nk);
          }
        }
      }
    }

    regioes.push({
      x: x0 * tile,
      y: y0 * tile,
      largura: (x1 - x0 + 1) * tile,
      altura: (y1 - y0 + 1) * tile,
      tiles: n,
    });
  }

  return regioes.sort((p, q) => q.tiles - p.tiles);
}

export type ResumoDiff = {
  mudou: boolean;
  /** Fração da área da página que mudou (0..1). */
  fracaoArea: number;
  regioes: RegiaoDiff[];
  /**
   * `true` quando a página mudou demais pra apontar região: aí a UI diz "mudou X% da área" em
   * vez de rabiscar dezenas de caixas, que é o que acontece numa revisão que só deslocou o
   * conteúdo (a diferença vira a união da posição velha com a nova).
   */
  muitoAlterada: boolean;
};

/** Junta comparação + agrupamento e classifica o resultado pra UI. */
export function resumirDiff(g: GradeDiff, tile = TILE): ResumoDiff {
  const fracaoArea = g.grade.length > 0 ? g.tilesAlterados / g.grade.length : 0;
  if (g.tilesAlterados === 0) return { mudou: false, fracaoArea: 0, regioes: [], muitoAlterada: false };
  const regioes = agruparRegioes(g.grade, g.cols, g.rows, tile);
  const muitoAlterada = regioes.length > LIMITE_REGIOES || fracaoArea > LIMITE_AREA;
  return {
    mudou: true,
    fracaoArea,
    // Mesmo "muito alterada" mantém as maiores — servem de mapa grosso do que olhar primeiro.
    regioes: muitoAlterada ? regioes.slice(0, LIMITE_REGIOES) : regioes,
    muitoAlterada,
  };
}

/**
 * Duas páginas só são comparáveis pixel a pixel se tiverem a MESMA proporção — aí basta
 * renderizar ambas na mesma largura. Proporção diferente significa folha diferente (ou
 * `/Rotate` que mudou entre as revisões), e forçar a comparação produziria um diff inteiro
 * falso. Melhor dizer que não dá do que devolver ruído com cara de resultado.
 */
export function comparaveis(
  a: { largura: number; altura: number },
  b: { largura: number; altura: number },
  epsilon = 0.01,
): boolean {
  if (a.largura <= 0 || a.altura <= 0 || b.largura <= 0 || b.altura <= 0) return false;
  const pa = a.largura / a.altura;
  const pb = b.largura / b.altura;
  return Math.abs(pa - pb) / Math.max(pa, pb) <= epsilon;
}
