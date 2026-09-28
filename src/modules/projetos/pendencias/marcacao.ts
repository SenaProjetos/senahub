/**
 * Marcações vetoriais do apontamento (item 9) — puro, sem I/O, igual a `ancora.ts`/`lib/dxf.ts`.
 *
 * **Modelo de dados.** `Pendencia.x`/`y` continuam sendo a ÂNCORA canônica do apontamento (o
 * ponto onde o arrasto começou), e nada que já existia muda: pino, numeração, deep-link,
 * âncora textual e replicação seguem lendo x/y. A forma vem por cima, em `marcacaoGeo`, como
 * **offsets normalizados relativos a (x,y)** — nunca em coordenada absoluta de página.
 *
 * Guardar offset (e não coordenada absoluta) é o que faz a forma acompanhar de graça a
 * relocalização da âncora textual (item 3): quando `pinsPosicionados` reposiciona um pino
 * herdado no texto correspondente da revisão nova, a forma anda junto sem nenhum código
 * extra. Com coordenada absoluta, o pino pularia pro lugar certo e o retângulo ficaria onde a
 * revisão ANTIGA o deixou — errado em silêncio, e só numa revisão de layout deslocado, que é
 * exatamente o caso que o item 3 existe pra tratar. Mesmo princípio de `ancoraDx`/`ancoraDy`.
 */

export const TIPOS_MARCACAO = ["ponto", "retangulo", "seta", "nuvem", "medida", "livre"] as const;
export type TipoMarcacao = (typeof TIPOS_MARCACAO)[number];

export const MARCACAO_LABEL: Record<TipoMarcacao, string> = {
  ponto: "Pino",
  retangulo: "Retângulo",
  seta: "Seta",
  nuvem: "Nuvem de revisão",
  medida: "Medida",
  livre: "Rabisco",
};

/** Formas cuja geometria é um SEGMENTO (âncora → ponta), não uma caixa. */
export function ehSegmento(tipo: TipoMarcacao): boolean {
  return tipo === "seta" || tipo === "medida";
}

/** Offset normalizado (fração da página) em relação à âncora (x,y) da pendência. */
export type OffsetPonto = { dx: number; dy: number };

/**
 * Geometria da marcação. `pontos` é sempre relativo à âncora:
 * - `ponto`   → `[]` (a âncora já é tudo)
 * - `retangulo`/`nuvem` → `[cantoOposto]` (a âncora é o primeiro canto)
 * - `seta`/`medida`    → `[ponta]` (a âncora é a cauda / início da medição)
 * - `livre` (rabisco)  → `pontos: []` e o desenho em `tracos`: um ou mais traços à mão livre,
 *   cada um uma lista de offsets. A âncora é o primeiro ponto do primeiro traço.
 *
 * Lista, e não campos nomeados, porque as formas futuras (polilinha, cota de medição do item
 * 28) são o mesmo desenho com mais vértices — e aí não muda nem o schema nem esta assinatura.
 * O rabisco precisou de `tracos` à parte porque vários traços soltos não são UMA lista de
 * vértices: juntar tudo em `pontos` ligaria o fim de um traço ao começo do seguinte.
 */
export type Marcacao = { tipo: TipoMarcacao; pontos: OffsetPonto[]; tracos?: OffsetPonto[][] };

/** Tetos do rabisco — o mesmo número vale na tela (para parar de aceitar traço) e no servidor. */
export const MAX_TRACOS_RABISCO = 60;
export const MAX_PONTOS_RABISCO = 4000;

/**
 * Tolerância da simplificação do traço, em fração da página: ~0,7 mm numa A1, menos de 1 px
 * com a prancha ajustada à largura. Some o tremido do mouse/dedo sem mudar o desenho.
 */
export const TOLERANCIA_TRACO = 0.0008;

/** Arrasto menor que isto (em fração da página) é considerado clique, não desenho. */
export const ARRASTO_MINIMO = 0.005;

const limitar = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);

/**
 * Interpreta o JSON cru da coluna. Retorna `null` pra qualquer coisa que não seja uma
 * marcação válida — inclusive `{tipo:"ponto"}`, que é o comportamento de sempre e não precisa
 * de forma nenhuma pra desenhar. Linha legada (coluna nula) cai aqui e some sem ruído.
 */
export function lerMarcacao(tipo: string | null | undefined, geo: unknown): Marcacao | null {
  if (!tipo || !(TIPOS_MARCACAO as readonly string[]).includes(tipo) || tipo === "ponto") return null;
  if (tipo === "livre") return lerRabisco(geo);
  const pontos = (geo as { pontos?: unknown })?.pontos;
  if (!Array.isArray(pontos)) return null;
  const limpos: OffsetPonto[] = [];
  for (const p of pontos) {
    const dx = (p as OffsetPonto)?.dx;
    const dy = (p as OffsetPonto)?.dy;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    limpos.push({ dx, dy });
  }
  // Toda forma conhecida hoje precisa de exatamente 1 offset; uma quantidade diferente é dado
  // corrompido (ou de uma versão futura) — melhor cair no pino do que desenhar lixo.
  if (limpos.length !== 1) return null;
  return { tipo: tipo as TipoMarcacao, pontos: limpos };
}

function lerOffset(p: unknown): OffsetPonto | null {
  const dx = (p as OffsetPonto)?.dx;
  const dy = (p as OffsetPonto)?.dy;
  if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return { dx, dy };
}

/** Rabisco gravado: traço com menos de 2 pontos é descartado; nenhum traço válido = sem forma. */
function lerRabisco(geo: unknown): Marcacao | null {
  const tracos = (geo as { tracos?: unknown })?.tracos;
  if (!Array.isArray(tracos)) return null;
  const limpos: OffsetPonto[][] = [];
  for (const t of tracos) {
    if (!Array.isArray(t)) return null;
    const pts: OffsetPonto[] = [];
    for (const p of t) {
      const o = lerOffset(p);
      if (!o) return null;
      pts.push(o);
    }
    if (pts.length >= 2) limpos.push(pts);
  }
  return limpos.length > 0 ? { tipo: "livre", pontos: [], tracos: limpos } : null;
}

/** Distância do ponto `p` ao segmento `a`–`b`. */
function distanciaAoSegmento(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : limitar(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Simplifica um traço (Ramer–Douglas–Peucker): tira os pontos que estão a menos de `tolerancia`
 * da reta entre os vizinhos que ficam. Um traço de mouse tem um ponto a cada poucos pixels;
 * gravar todos encheria a linha do banco sem mudar nada que se veja.
 */
export function simplificarTraco<T extends { x: number; y: number }>(pontos: readonly T[], tolerancia = TOLERANCIA_TRACO): T[] {
  if (pontos.length <= 2) return [...pontos];
  const manter = new Array<boolean>(pontos.length).fill(false);
  manter[0] = true;
  manter[pontos.length - 1] = true;
  // Pilha em vez de recursão: um traço longo não estoura a pilha de chamadas.
  const pilha: [number, number][] = [[0, pontos.length - 1]];
  while (pilha.length > 0) {
    const [ini, fim] = pilha.pop()!;
    let maior = -1;
    let idx = -1;
    for (let i = ini + 1; i < fim; i++) {
      const d = distanciaAoSegmento(pontos[i], pontos[ini], pontos[fim]);
      if (d > maior) {
        maior = d;
        idx = i;
      }
    }
    if (idx !== -1 && maior > tolerancia) {
      manter[idx] = true;
      pilha.push([ini, idx], [idx, fim]);
    }
  }
  return pontos.filter((_, i) => manter[i]);
}

/** 5 casas bastam (0,01 mm numa A1) e deixam o JSON gravado bem menor. */
const arredondar = (v: number) => Math.round(v * 1e5) / 1e5;

/**
 * Monta o rabisco a partir dos traços desenhados, em coordenadas normalizadas de página (sem
 * giro). Cada traço é simplificado; traço de 1 ponto (toque sem arrastar) sai. A âncora (x,y)
 * é o primeiro ponto do primeiro traço e o resto vira offset a partir dela — o mesmo modelo das
 * outras formas, então o desenho acompanha a âncora textual numa revisão de layout deslocado.
 *
 * Devolve `null` quando não sobra traço, ou quando o desenho inteiro cabe num ponto (menor que
 * `ARRASTO_MINIMO` nos dois eixos): aí o chamador trata como clique, igual às outras formas.
 */
export function construirRabisco(
  tracos: readonly (readonly { x: number; y: number }[])[],
): { x: number; y: number; marcacao: Marcacao } | null {
  const limpos = tracos
    .map((t) => simplificarTraco(t.map((p) => ({ x: limitar(p.x, 0, 1), y: limitar(p.y, 0, 1) }))))
    .filter((t) => t.length >= 2)
    .slice(0, MAX_TRACOS_RABISCO);
  if (limpos.length === 0) return null;

  const todos = limpos.flat();
  const larg = Math.max(...todos.map((p) => p.x)) - Math.min(...todos.map((p) => p.x));
  const alt = Math.max(...todos.map((p) => p.y)) - Math.min(...todos.map((p) => p.y));
  if (larg < ARRASTO_MINIMO && alt < ARRASTO_MINIMO) return null;

  const x = limpos[0][0].x;
  const y = limpos[0][0].y;
  let restantes = MAX_PONTOS_RABISCO;
  const offsets: OffsetPonto[][] = [];
  for (const t of limpos) {
    if (restantes < 2) break;
    const parte = t.slice(0, restantes);
    restantes -= parte.length;
    offsets.push(parte.map((p) => ({ dx: arredondar(p.x - x), dy: arredondar(p.y - y) })));
  }
  return { x, y, marcacao: { tipo: "livre", pontos: [], tracos: offsets } };
}

/**
 * Monta a marcação a partir de um arrasto em coordenadas normalizadas de página. Devolve
 * `null` quando o arrasto foi curto demais (o chamador trata como clique → pino simples).
 */
export function construirMarcacao(
  tipo: TipoMarcacao,
  inicio: { x: number; y: number },
  fim: { x: number; y: number },
): { x: number; y: number; marcacao: Marcacao } | null {
  const x = limitar(inicio.x, 0, 1);
  const y = limitar(inicio.y, 0, 1);
  if (tipo === "ponto") return { x, y, marcacao: { tipo: "ponto", pontos: [] } };
  // Rabisco não é arrasto de dois pontos: nasce de `construirRabisco`, com os traços inteiros.
  if (tipo === "livre") return null;
  const dx = limitar(fim.x, 0, 1) - x;
  const dy = limitar(fim.y, 0, 1) - y;
  if (Math.abs(dx) < ARRASTO_MINIMO && Math.abs(dy) < ARRASTO_MINIMO) return null;
  return { x, y, marcacao: { tipo, pontos: [{ dx, dy }] } };
}

/**
 * Caixa da marcação em coordenadas normalizadas de PÁGINA (0..1), já com o arrasto
 * normalizado — arrastar da direita pra esquerda ou de baixo pra cima dá a mesma caixa.
 */
export function caixaMarcacao(
  x: number,
  y: number,
  m: Marcacao | null,
): { esquerda: number; topo: number; largura: number; altura: number } {
  if (m?.tipo === "livre" && m.tracos?.length) {
    const todos = m.tracos.flat();
    const xs = todos.map((o) => x + o.dx);
    const ys = todos.map((o) => y + o.dy);
    const esquerda = Math.min(x, ...xs);
    const topo = Math.min(y, ...ys);
    return { esquerda, topo, largura: Math.max(x, ...xs) - esquerda, altura: Math.max(y, ...ys) - topo };
  }
  const p = m?.pontos[0];
  if (!p) return { esquerda: x, topo: y, largura: 0, altura: 0 };
  return {
    esquerda: Math.min(x, x + p.dx),
    topo: Math.min(y, y + p.dy),
    largura: Math.abs(p.dx),
    altura: Math.abs(p.dy),
  };
}

/**
 * Caminho SVG de uma "nuvem de revisão" (o balão ondulado que o pessoal de projeto usa pra
 * circundar o que mudou) cobrindo o retângulo `largura`×`altura`, em coordenadas LOCAIS
 * começando em (0,0).
 *
 * Cada lado é dividido em segmentos de comprimento ~`raio*2` e cada segmento vira um
 * semicírculo estufado pra FORA. O percurso é horário (topo →, direita ↓, base ←, esquerda ↑)
 * e, como o eixo Y do SVG cresce pra baixo, `sweep-flag=1` (sentido de ângulo positivo, que na
 * tela aparece horário) empurra a barriga pra fora em todos os quatro lados — sem precisar de
 * caso especial por lado. `large-arc-flag=0` com raio = metade do segmento dá exatamente meio
 * círculo.
 *
 * Cada lado é dividido de forma independente e sempre num número INTEIRO de segmentos, então
 * os cantos caem sempre em fim de arco — se o passo fosse contínuo ao longo do perímetro, a
 * onda cruzaria os cantos no meio de um arco e a nuvem ficaria com bicos tortos.
 */
export function caminhoNuvem(largura: number, altura: number, raio: number): string {
  const l = Math.abs(largura);
  const a = Math.abs(altura);
  const r = Math.max(raio, 0.5);
  if (l <= 0 || a <= 0) return "";

  const partes: string[] = [`M 0 0`];
  // Um lado curto demais pra uma onda ainda recebe UMA — melhor uma barriga só do que um
  // segmento reto no meio de uma nuvem.
  const segmentos = (comprimento: number) => Math.max(1, Math.round(comprimento / (r * 2)));
  const arco = (passo: number, x: number, y: number) => `A ${(passo / 2).toFixed(3)} ${(passo / 2).toFixed(3)} 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)}`;

  const nTopo = segmentos(l);
  for (let i = 1; i <= nTopo; i++) partes.push(arco(l / nTopo, (l * i) / nTopo, 0));
  const nDir = segmentos(a);
  for (let i = 1; i <= nDir; i++) partes.push(arco(a / nDir, l, (a * i) / nDir));
  const nBase = segmentos(l);
  for (let i = 1; i <= nBase; i++) partes.push(arco(l / nBase, l - (l * i) / nBase, a));
  const nEsq = segmentos(a);
  for (let i = 1; i <= nEsq; i++) partes.push(arco(a / nEsq, 0, a - (a * i) / nEsq));

  partes.push("Z");
  return partes.join(" ");
}

/**
 * Caixa do RECORTE da miniatura (item 14), em pixels do canvas já renderizado.
 *
 * Parte da caixa da marcação, aplica uma folga proporcional (uma marcação colada no desenho
 * fica ilegível sem contexto em volta) e prende tudo dentro do canvas. `larguraCanvas`/
 * `alturaCanvas` são os pixels REAIS do `<canvas>` (que inclui o DPR), não o tamanho CSS —
 * usar o tamanho CSS produziria um recorte deslocado em tela retina, que é o tipo de erro que
 * gera um PNG plausível e errado.
 */
export function caixaRecorte(
  x: number,
  y: number,
  m: Marcacao | null,
  larguraCanvas: number,
  alturaCanvas: number,
  folga = 0.25,
): { sx: number; sy: number; sw: number; sh: number } {
  const c = caixaMarcacao(x, y, m);
  // Marcação de área zero (não deveria chegar aqui) vira uma janelinha em volta do ponto, em
  // vez de um recorte de 0×0 que geraria um PNG vazio.
  const largura = c.largura > 0 ? c.largura : 0.08;
  const altura = c.altura > 0 ? c.altura : 0.08;
  const fx = largura * folga;
  const fy = altura * folga;

  const esq = Math.max(0, c.esquerda - fx);
  const topo = Math.max(0, c.topo - fy);
  const dir = Math.min(1, c.esquerda + largura + fx);
  const base = Math.min(1, c.topo + altura + fy);

  // Arredonda as BORDAS e tira o tamanho delas. Arredondar offset e tamanho separadamente
  // deixa `sx + sw` estourar o canvas em 1px na borda — e `drawImage` com origem fora do
  // canvas devolve faixa transparente em vez de erro, ou seja, um PNG plausível e errado.
  const sx = Math.round(esq * larguraCanvas);
  const sy = Math.round(topo * alturaCanvas);
  return {
    sx,
    sy,
    sw: Math.max(1, Math.round(dir * larguraCanvas) - sx),
    sh: Math.max(1, Math.round(base * alturaCanvas) - sy),
  };
}

/**
 * Pontas da seta (as duas abas do "V"), em coordenadas locais, dada a cauda e a ponta.
 * Puro pra ficar testável e pra o mesmo cálculo servir depois ao PDF carimbado (item 20),
 * que vai desenhar a mesma seta fora do navegador.
 */
export function abasSeta(
  cauda: { x: number; y: number },
  ponta: { x: number; y: number },
  tamanho: number,
  aberturaGraus = 25,
): [{ x: number; y: number }, { x: number; y: number }] {
  const ang = Math.atan2(ponta.y - cauda.y, ponta.x - cauda.x);
  const ab = (aberturaGraus * Math.PI) / 180;
  return [
    { x: ponta.x - tamanho * Math.cos(ang - ab), y: ponta.y - tamanho * Math.sin(ang - ab) },
    { x: ponta.x - tamanho * Math.cos(ang + ab), y: ponta.y - tamanho * Math.sin(ang + ab) },
  ];
}
