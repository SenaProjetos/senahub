/**
 * Writer DXF genérico (AutoCAD R12 — AC1009, ASCII). Puro: sem I/O, sem Prisma, sem `server-only`.
 * Base reusável para o detalhamento das ferramentas de engenharia (F1+).
 *
 * Unidades: o DXF é adimensional; por convenção deste projeto, **as coordenadas são em mm**
 * (declaramos `$INSUNITS=4` para que CADs modernos interpretem assim; leitores R12 estritos ignoram).
 * Eixos: X para a direita, **Y para CIMA** (convenção CAD nativa). Quem vier de coordenadas de tela
 * (Y para baixo) deve inverter antes de chamar — este módulo NÃO faz inversão.
 *
 * Decisões de compatibilidade (R12):
 * - **Polilinha** usa `POLYLINE`/`VERTEX`/`SEQEND` (heavyweight). `LWPOLYLINE` só existe a partir do
 *   R14; um leitor R12 estrito a rejeitaria. A pesada é importável em praticamente qualquer CAD.
 * - **Cota linear** é desenhada com primitivas (extensões + linha de cota + ticks + texto), não com a
 *   entidade `DIMENSION` nativa (que exige `DIMSTYLE`/blocos e é frágil entre CADs em R12).
 * - Camadas e linetype `CONTINUOUS` são declaradas nas tabelas `LAYER`/`LTYPE`.
 */

export type Ponto = { x: number; y: number };

/** Alinhamento horizontal do TEXT (group code 72). */
export const AlinhamentoH = { esquerda: 0, centro: 1, direita: 2 } as const;
export type AlinhamentoH = (typeof AlinhamentoH)[keyof typeof AlinhamentoH];

/** Alinhamento vertical do TEXT (group code 73). */
export const AlinhamentoV = { linhaBase: 0, baixo: 1, meio: 2, topo: 3 } as const;
export type AlinhamentoV = (typeof AlinhamentoV)[keyof typeof AlinhamentoV];

type OpcoesBase = { camada?: string };
type OpcoesTexto = OpcoesBase & {
  /** Rotação em graus, anti-horária a partir do eixo +X. */
  rotacao?: number;
  alinhamentoH?: AlinhamentoH;
  alinhamentoV?: AlinhamentoV;
};
type OpcoesPolilinha = OpcoesBase & { fechada?: boolean };
type OpcoesCota = OpcoesBase & {
  /** Altura do texto da cota (mm). Default 2.5. */
  altura?: number;
  /** Rótulo manual; se ausente, usa o comprimento medido. */
  texto?: string;
  /** Casas decimais do comprimento medido. Default 1. */
  casas?: number;
};

const CAMADA_PADRAO = "0";

/** Formata número para o DXF: sem notação científica, sem zeros à direita supérfluos, sem `-0`. */
export function fmt(n: number, casas = 6): string {
  if (!Number.isFinite(n)) throw new Error("Coordenada/valor inválido para DXF (NaN ou Infinity).");
  let s = n.toFixed(casas);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}

/** Sanitiza nome de camada para o R12 (sem espaços/caracteres problemáticos, até 31 chars). */
function sanitizarCamada(nome: string): string {
  const limpo = nome
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_$.-]/g, "")
    .slice(0, 31);
  return limpo.length > 0 ? limpo : CAMADA_PADRAO;
}

/** Empilha um par (group code, valor) na saída plana. */
function par(out: string[], code: number, valor: string): void {
  out.push(String(code), valor);
}

// ── Primitivas (geradores puros) ──────────────────────────────────────────────
// Cada uma devolve um array plano [code, valor, code, valor, ...] de uma entidade.

export function entidadeTexto(p: Ponto, altura: number, conteudo: string, opts: OpcoesTexto = {}): string[] {
  const camada = sanitizarCamada(opts.camada ?? CAMADA_PADRAO);
  // TEXT é monolinha; quebras viram espaço.
  const txt = conteudo.replace(/\r?\n/g, " ");
  const out: string[] = [];
  par(out, 0, "TEXT");
  par(out, 8, camada);
  par(out, 10, fmt(p.x));
  par(out, 20, fmt(p.y));
  par(out, 30, "0");
  par(out, 40, fmt(altura));
  par(out, 1, txt);
  if (opts.rotacao) par(out, 50, fmt(opts.rotacao));
  const h = opts.alinhamentoH ?? AlinhamentoH.esquerda;
  const v = opts.alinhamentoV ?? AlinhamentoV.linhaBase;
  if (h !== 0 || v !== 0) {
    par(out, 72, String(h));
    par(out, 73, String(v));
    // Com 72/73 ≠ 0, o ponto efetivo de alinhamento é 11/21 (10/20 fica como referência).
    par(out, 11, fmt(p.x));
    par(out, 21, fmt(p.y));
    par(out, 31, "0");
  }
  return out;
}

export function entidadeLinha(p1: Ponto, p2: Ponto, opts: OpcoesBase = {}): string[] {
  const camada = sanitizarCamada(opts.camada ?? CAMADA_PADRAO);
  const out: string[] = [];
  par(out, 0, "LINE");
  par(out, 8, camada);
  par(out, 10, fmt(p1.x));
  par(out, 20, fmt(p1.y));
  par(out, 30, "0");
  par(out, 11, fmt(p2.x));
  par(out, 21, fmt(p2.y));
  par(out, 31, "0");
  return out;
}

export function entidadeCirculo(centro: Ponto, raio: number, opts: OpcoesBase = {}): string[] {
  if (raio <= 0) throw new Error("Raio do círculo deve ser positivo.");
  const camada = sanitizarCamada(opts.camada ?? CAMADA_PADRAO);
  const out: string[] = [];
  par(out, 0, "CIRCLE");
  par(out, 8, camada);
  par(out, 10, fmt(centro.x));
  par(out, 20, fmt(centro.y));
  par(out, 30, "0");
  par(out, 40, fmt(raio));
  return out;
}

/**
 * Arco. Ângulos em **graus**, sentido **anti-horário** a partir do eixo +X; o arco é traçado
 * de `anguloInicial` para `anguloFinal` no sentido anti-horário (convenção DXF).
 */
export function entidadeArco(
  centro: Ponto,
  raio: number,
  anguloInicial: number,
  anguloFinal: number,
  opts: OpcoesBase = {},
): string[] {
  if (raio <= 0) throw new Error("Raio do arco deve ser positivo.");
  const camada = sanitizarCamada(opts.camada ?? CAMADA_PADRAO);
  const out: string[] = [];
  par(out, 0, "ARC");
  par(out, 8, camada);
  par(out, 10, fmt(centro.x));
  par(out, 20, fmt(centro.y));
  par(out, 30, "0");
  par(out, 40, fmt(raio));
  par(out, 50, fmt(anguloInicial));
  par(out, 51, fmt(anguloFinal));
  return out;
}

/** Polilinha 2D (R12 heavyweight: POLYLINE + VERTEX* + SEQEND). */
export function entidadePolilinha(pontos: Ponto[], opts: OpcoesPolilinha = {}): string[] {
  if (pontos.length < 2) throw new Error("Polilinha exige ao menos 2 pontos.");
  const camada = sanitizarCamada(opts.camada ?? CAMADA_PADRAO);
  const out: string[] = [];
  par(out, 0, "POLYLINE");
  par(out, 8, camada);
  par(out, 66, "1"); // "vértices seguem" — obrigatório no R12
  par(out, 70, opts.fechada ? "1" : "0"); // bit 1 = fechada
  // Ponto de elevação da polilinha (0,0,0).
  par(out, 10, "0");
  par(out, 20, "0");
  par(out, 30, "0");
  for (const pt of pontos) {
    par(out, 0, "VERTEX");
    par(out, 8, camada);
    par(out, 10, fmt(pt.x));
    par(out, 20, fmt(pt.y));
    par(out, 30, "0");
  }
  par(out, 0, "SEQEND");
  par(out, 8, camada);
  return out;
}

// ── Cota linear (composta por primitivas) ─────────────────────────────────────

/**
 * Geometria de uma cota linear alinhada entre `p1` e `p2`, com a linha de cota afastada
 * perpendicularmente por `afastamento` (sinal define o lado). Devolve as entidades já planas.
 * Inclui linhas de extensão, linha de cota, ticks oblíquos (estilo arquitetônico) e o texto medido.
 */
export function geometriaCotaLinear(
  p1: Ponto,
  p2: Ponto,
  afastamento: number,
  opts: OpcoesCota = {},
): string[] {
  const camada = opts.camada ?? "COTAS";
  const altura = opts.altura ?? 2.5;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const comprimento = Math.hypot(dx, dy);
  if (comprimento < 1e-9) throw new Error("Cota com comprimento nulo: p1 e p2 coincidem.");

  // Direção (u) e normal (n = u girado +90°).
  const ux = dx / comprimento;
  const uy = dy / comprimento;
  const nx = -uy;
  const ny = ux;

  // Pontos da linha de cota (deslocados pela normal).
  const a: Ponto = { x: p1.x + nx * afastamento, y: p1.y + ny * afastamento };
  const b: Ponto = { x: p2.x + nx * afastamento, y: p2.y + ny * afastamento };

  // Extensão das linhas auxiliares um pouco além da linha de cota.
  const overshoot = altura * 0.6 * Math.sign(afastamento || 1);
  const aExt: Ponto = { x: a.x + nx * overshoot, y: a.y + ny * overshoot };
  const bExt: Ponto = { x: b.x + nx * overshoot, y: b.y + ny * overshoot };

  const ent: string[] = [];
  // Linhas de extensão (do objeto até além da linha de cota).
  ent.push(...entidadeLinha(p1, aExt, { camada }));
  ent.push(...entidadeLinha(p2, bExt, { camada }));
  // Linha de cota.
  ent.push(...entidadeLinha(a, b, { camada }));
  // Ticks oblíquos (45° entre a linha de cota e a extensão) em cada extremidade.
  const tick = altura * 0.6;
  const tx = (ux + nx) * tick * 0.5;
  const ty = (uy + ny) * tick * 0.5;
  ent.push(...entidadeLinha({ x: a.x - tx, y: a.y - ty }, { x: a.x + tx, y: a.y + ty }, { camada }));
  ent.push(...entidadeLinha({ x: b.x - tx, y: b.y - ty }, { x: b.x + tx, y: b.y + ty }, { camada }));

  // Texto: comprimento medido (ou rótulo manual), centrado sobre o meio da linha de cota.
  const rotulo = opts.texto ?? fmt(comprimento, opts.casas ?? 1);
  const meio: Ponto = {
    x: (a.x + b.x) / 2 + nx * altura * 0.7,
    y: (a.y + b.y) / 2 + ny * altura * 0.7,
  };
  // Rotação alinhada à linha de cota, normalizada para o texto não ficar de cabeça para baixo.
  let rot = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (rot > 90 || rot <= -90) rot += 180;
  ent.push(
    ...entidadeTexto(meio, altura, rotulo, {
      camada,
      rotacao: rot,
      alinhamentoH: AlinhamentoH.centro,
      alinhamentoV: AlinhamentoV.meio,
    }),
  );
  return ent;
}

// ── Documento (builder) ───────────────────────────────────────────────────────

/**
 * Acumula entidades e camadas e monta um DXF R12 completo (HEADER + TABLES + ENTITIES + EOF).
 * Métodos encadeáveis. Camadas referenciadas por entidades são auto-registradas (cor 7) se ainda
 * não declaradas via `camada()`.
 */
export class DxfDocumento {
  private entidades: string[] = [];
  /** nome → cor ACI (1–255; 7 = padrão preto/branco). Ordem de inserção preservada. */
  private camadas = new Map<string, number>();

  constructor() {
    this.camadas.set(CAMADA_PADRAO, 7); // layer "0" sempre existe
  }

  /** Declara/atualiza uma camada com cor ACI (1–255). */
  camada(nome: string, cor = 7): this {
    this.camadas.set(sanitizarCamada(nome), cor);
    return this;
  }

  private registrar(nome?: string): void {
    const c = sanitizarCamada(nome ?? CAMADA_PADRAO);
    if (!this.camadas.has(c)) this.camadas.set(c, 7);
  }

  texto(p: Ponto, altura: number, conteudo: string, opts: OpcoesTexto = {}): this {
    this.registrar(opts.camada);
    this.entidades.push(...entidadeTexto(p, altura, conteudo, opts));
    return this;
  }

  linha(p1: Ponto, p2: Ponto, opts: OpcoesBase = {}): this {
    this.registrar(opts.camada);
    this.entidades.push(...entidadeLinha(p1, p2, opts));
    return this;
  }

  circulo(centro: Ponto, raio: number, opts: OpcoesBase = {}): this {
    this.registrar(opts.camada);
    this.entidades.push(...entidadeCirculo(centro, raio, opts));
    return this;
  }

  arco(centro: Ponto, raio: number, anguloInicial: number, anguloFinal: number, opts: OpcoesBase = {}): this {
    this.registrar(opts.camada);
    this.entidades.push(...entidadeArco(centro, raio, anguloInicial, anguloFinal, opts));
    return this;
  }

  polilinha(pontos: Ponto[], opts: OpcoesPolilinha = {}): this {
    this.registrar(opts.camada);
    this.entidades.push(...entidadePolilinha(pontos, opts));
    return this;
  }

  cotaLinear(p1: Ponto, p2: Ponto, afastamento: number, opts: OpcoesCota = {}): this {
    this.registrar(opts.camada ?? "COTAS");
    this.entidades.push(...geometriaCotaLinear(p1, p2, afastamento, opts));
    return this;
  }

  private secaoTabelas(): string[] {
    const out: string[] = [];
    par(out, 0, "SECTION");
    par(out, 2, "TABLES");

    // Tabela de linetype: declara CONTINUOUS (referenciada por toda camada).
    par(out, 0, "TABLE");
    par(out, 2, "LTYPE");
    par(out, 70, "1");
    par(out, 0, "LTYPE");
    par(out, 2, "CONTINUOUS");
    par(out, 70, "0");
    par(out, 3, "Solid line");
    par(out, 72, "65");
    par(out, 73, "0");
    par(out, 40, "0");
    par(out, 0, "ENDTAB");

    // Tabela de camadas.
    par(out, 0, "TABLE");
    par(out, 2, "LAYER");
    par(out, 70, String(this.camadas.size));
    for (const [nome, cor] of this.camadas) {
      par(out, 0, "LAYER");
      par(out, 2, nome);
      par(out, 70, "0");
      par(out, 62, String(cor));
      par(out, 6, "CONTINUOUS");
    }
    par(out, 0, "ENDTAB");

    par(out, 0, "ENDSEC");
    return out;
  }

  /** Serializa o documento DXF completo. */
  toString(): string {
    const header = [
      "0", "SECTION",
      "2", "HEADER",
      "9", "$ACADVER",
      "1", "AC1009",
      "9", "$INSUNITS",
      "70", "4", // 4 = milímetros (ignorado por R12 estrito; útil em CAD moderno)
      "0", "ENDSEC",
    ];
    const entities = ["0", "SECTION", "2", "ENTITIES", ...this.entidades, "0", "ENDSEC"];
    return [...header, ...this.secaoTabelas(), ...entities, "0", "EOF", ""].join("\n");
  }
}
