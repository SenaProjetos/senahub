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

export const TIPOS_MARCACAO = ["ponto", "retangulo", "seta", "nuvem", "medida"] as const;
export type TipoMarcacao = (typeof TIPOS_MARCACAO)[number];

export const MARCACAO_LABEL: Record<TipoMarcacao, string> = {
  ponto: "Pino",
  retangulo: "Retângulo",
  seta: "Seta",
  nuvem: "Nuvem de revisão",
  medida: "Medida",
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
 *
 * Lista, e não campos nomeados, porque as formas futuras (polilinha, cota de medição do item
 * 28) são o mesmo desenho com mais vértices — e aí não muda nem o schema nem esta assinatura.
 */
export type Marcacao = { tipo: TipoMarcacao; pontos: OffsetPonto[] };

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
