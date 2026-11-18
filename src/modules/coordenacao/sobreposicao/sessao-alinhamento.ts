// Sessão de alinhamento de UMA camada da sobreposição 2D. Pura: sem I/O, roda no navegador.
// A tela guarda a sessão no estado e chama estas funções a cada clique, arraste, seta ou campo digitado;
// só "Salvar alinhamento" escreve no banco (`salvarAlinhamento`, com a `versaoLida`).
import type { Formato } from "./regras";
import {
  aplicar,
  inverter,
  normalizarGiro,
  porDoisPontos,
  porUmPonto,
  type Alinhamento,
  type Ponto,
} from "./transformacao";

/** 1 ponto = só mover; 2 pontos = mover + girar + escalar (ALIGN do CAD); ajuste = arrastar, setas e números. */
export type ModoAlinhar = "um_ponto" | "dois_pontos" | "ajuste";

/** Um clique já dado no par em andamento: na camada (guardado no nativo dela) ou na base (no mundo). */
export type Clique = { lado: "camada"; nativo: Ponto } | { lado: "base"; mundo: Ponto };

export type SessaoAlinhamento = {
  camadaId: string;
  formato: Formato;
  /** Alinhando a própria base: o destino é outra camada já alinhada (o arquivo antigo da base não está na tela). */
  ehBase: boolean;
  /** Versão do alinhamento lida da cena; `null` = a camada ainda não tinha alinhamento neste formato. */
  versaoLida: number | null;
  /** O alinhamento com que a sessão abriu ("Cancelar" volta a ele). */
  inicial: Alinhamento;
  atual: Alinhamento;
  /** Passos anteriores, o mais recente no fim. */
  desfazer: Alinhamento[];
  modo: ModoAlinhar;
  /** Sempre alternando camada, base, camada, base. */
  cliques: Clique[];
};

export const LIMITE_DESFAZER = 100;
/** Passo das setas em px de tela; com Shift, o grande. */
export const PASSO_SETA_PX = 1;
export const PASSO_SETA_GRANDE_PX = 10;

const ERRO_ESCALA = "A escala precisa ser maior que zero.";
const ERRO_NUMERO = "Digite um número.";

export function iniciarSessao(opts: {
  camadaId: string;
  formato: Formato;
  versaoLida: number | null;
  alinhamento: Alinhamento;
  ehBase?: boolean;
}): SessaoAlinhamento {
  return {
    camadaId: opts.camadaId,
    formato: opts.formato,
    ehBase: opts.ehBase ?? false,
    versaoLida: opts.versaoLida,
    inicial: opts.alinhamento,
    atual: opts.alinhamento,
    desfazer: [],
    modo: "dois_pontos",
    cliques: [],
  };
}

function mesmo(a: Alinhamento, b: Alinhamento): boolean {
  return a.tx === b.tx && a.ty === b.ty && a.giro === b.giro && a.escala === b.escala;
}

/** Novo alinhamento como um passo de desfazer (o atual vai para a pilha). */
function comPasso(s: SessaoAlinhamento, novo: Alinhamento): SessaoAlinhamento {
  const pilha = [...s.desfazer, s.atual];
  return { ...s, atual: novo, desfazer: pilha.slice(-LIMITE_DESFAZER), cliques: [] };
}

export function mudou(s: SessaoAlinhamento): boolean {
  return !mesmo(s.atual, s.inicial);
}

export function trocarModo(s: SessaoAlinhamento, modo: ModoAlinhar): SessaoAlinhamento {
  return { ...s, modo, cliques: [] };
}

/** Descarta os cliques do par em andamento (Esc). */
export function limparCliques(s: SessaoAlinhamento): SessaoAlinhamento {
  return s.cliques.length === 0 ? s : { ...s, cliques: [] };
}

/** Clique no desenho, em coordenadas do mundo. No ajuste fino não faz nada. */
export function clicar(s: SessaoAlinhamento, mundo: Ponto): { sessao: SessaoAlinhamento; erro?: string } {
  if (s.modo === "ajuste") return { sessao: s };
  const vezDaCamada = s.cliques.length % 2 === 0;
  const clique: Clique = vezDaCamada
    ? { lado: "camada", nativo: aplicar(inverter(s.atual), mundo) }
    : { lado: "base", mundo };
  const cliques = [...s.cliques, clique];

  const origens = cliques.flatMap((c) => (c.lado === "camada" ? [c.nativo] : []));
  const destinos = cliques.flatMap((c) => (c.lado === "base" ? [c.mundo] : []));

  if (s.modo === "um_ponto" && destinos.length === 1) {
    return { sessao: comPasso(s, porUmPonto(s.atual, origens[0], destinos[0])) };
  }
  if (s.modo === "dois_pontos" && destinos.length === 2) {
    const r = porDoisPontos(origens[0], origens[1], destinos[0], destinos[1]);
    if (!r.ok) return { sessao: { ...s, cliques: [] }, erro: r.erro };
    return { sessao: comPasso(s, r.alinhamento) };
  }
  return { sessao: { ...s, cliques } };
}

/** Texto do que fazer agora. */
export function instrucao(s: SessaoAlinhamento): string {
  if (s.modo === "ajuste") {
    return "Arraste a camada, use as setas (Shift = passo maior) ou digite os valores. O botão do meio do mouse move a vista.";
  }
  const n = s.cliques.length;
  const destino = s.ehBase ? "numa camada já alinhada" : "na base";
  if (s.modo === "um_ponto") {
    return n === 0 ? "Clique num ponto da camada que está alinhando." : `Clique no mesmo ponto ${destino}.`;
  }
  return [
    "Clique num ponto da camada que está alinhando.",
    `Clique no mesmo ponto ${destino}.`,
    "Clique num segundo ponto da camada, longe do primeiro.",
    `Clique no mesmo segundo ponto ${destino}.`,
  ][n];
}

/** Pontos já clicados do par em andamento, no mundo (a origem acompanha o desenho atual da camada). */
export function marcadores(s: SessaoAlinhamento): { mundo: Ponto; lado: "camada" | "base"; par: 1 | 2 }[] {
  return s.cliques.map((c, i) => ({
    mundo: c.lado === "camada" ? aplicar(s.atual, c.nativo) : c.mundo,
    lado: c.lado,
    par: i < 2 ? 1 : 2,
  }));
}

/**
 * Desloca a camada no mundo. `registrar` = começa um passo de desfazer (seta, ou o primeiro movimento
 * de um arraste); os movimentos seguintes do mesmo arraste passam `false`.
 */
export function deslocar(s: SessaoAlinhamento, d: Ponto, registrar: boolean): SessaoAlinhamento {
  const novo = { ...s.atual, tx: s.atual.tx + d.x, ty: s.atual.ty + d.y };
  return registrar ? comPasso(s, novo) : { ...s, atual: novo };
}

/** Deslocamento no mundo de uma seta do teclado; `escalaVista` = px de tela por unidade do mundo. */
export function passoDaSeta(tecla: string, shift: boolean, escalaVista: number): Ponto | null {
  const px = (shift ? PASSO_SETA_GRANDE_PX : PASSO_SETA_PX) / escalaVista;
  switch (tecla) {
    case "ArrowRight":
      return { x: px, y: 0 };
    case "ArrowLeft":
      return { x: -px, y: 0 };
    case "ArrowDown":
      return { x: 0, y: px };
    case "ArrowUp":
      return { x: 0, y: -px };
    default:
      return null;
  }
}

/** Campos X, Y, giro (graus) e escala digitados. */
export function definirCampos(
  s: SessaoAlinhamento,
  campos: Partial<Alinhamento>,
): { sessao: SessaoAlinhamento; erro?: string } {
  const valores = Object.values(campos);
  if (valores.some((v) => typeof v !== "number" || !Number.isFinite(v))) return { sessao: s, erro: ERRO_NUMERO };
  if (campos.escala !== undefined && campos.escala <= 0) return { sessao: s, erro: ERRO_ESCALA };
  const novo: Alinhamento = { ...s.atual, ...campos };
  novo.giro = normalizarGiro(novo.giro);
  if (mesmo(novo, s.atual)) return { sessao: s };
  return { sessao: comPasso(s, novo) };
}

export function desfazer(s: SessaoAlinhamento): SessaoAlinhamento {
  if (s.desfazer.length === 0) return s;
  return { ...s, atual: s.desfazer[s.desfazer.length - 1], desfazer: s.desfazer.slice(0, -1), cliques: [] };
}
