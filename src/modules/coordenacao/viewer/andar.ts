/**
 * Modo andar do visualizador 3D (spec 2026-11-20, "Andar"): contas puras da câmera em primeira pessoa, no espaço do
 * three (Y para cima, metros). Sem colisão nem gravidade — atravessa paredes e lajes. O motor (`engine.ts`) aplica o
 * estado à câmera a cada quadro; aqui não há three, React nem DOM.
 *
 * Convenção do olhar: yaw 0 olha para −Z (a câmera padrão do three) e cresce girando para a esquerda (anti-horário
 * visto de cima); pitch positivo olha para cima.
 */
import type { Vec3 } from "@/modules/coordenacao/viewer/coords";

/** Altura do olho acima do piso do pavimento. */
export const ALTURA_OLHO_M = 1.6;
/** Passo normal (m/s) — andar de gente. */
export const VELOCIDADE_M_S = 1.4;
/** Shift corre. */
export const FATOR_CORRER = 2.5;
/** O olhar nunca chega ao zênite/nadir (a câmera vira de ponta-cabeça lá). */
export const PITCH_MAXIMO_RAD = (85 * Math.PI) / 180;

export type EstadoAndar = { pos: Vec3; yaw: number; pitch: number };

// Teclas pelo `KeyboardEvent.code` (posição física: vale em ABNT2, QWERTY e AZERTY).
const FRENTE = ["KeyW", "ArrowUp"];
const TRAS = ["KeyS", "ArrowDown"];
const ESQUERDA = ["KeyA", "ArrowLeft"];
const DIREITA = ["KeyD", "ArrowRight"];
const SOBE = ["KeyQ", "PageUp"];
const DESCE = ["KeyE", "PageDown"];
const CORRE = ["ShiftLeft", "ShiftRight"];

/** Todas as teclas que o modo andar usa — enquanto anda, elas são do andar (não rolam a página nem mudam a vista). */
export const TECLAS_DO_ANDAR: ReadonlySet<string> = new Set([
  ...FRENTE,
  ...TRAS,
  ...ESQUERDA,
  ...DIREITA,
  ...SOBE,
  ...DESCE,
  ...CORRE,
]);

const algum = (teclas: ReadonlySet<string>, lista: readonly string[]) => lista.some((t) => teclas.has(t));
const eixo = (teclas: ReadonlySet<string>, mais: readonly string[], menos: readonly string[]) =>
  (algum(teclas, mais) ? 1 : 0) - (algum(teclas, menos) ? 1 : 0);

/** Entra no centro da caixa em planta, com o olho a 1,60 m do piso, olhando na horizontal. */
export function entradaDoAndar(caixa: { min: Vec3; max: Vec3 }, pisoY: number): EstadoAndar {
  return {
    pos: [(caixa.min[0] + caixa.max[0]) / 2, pisoY + ALTURA_OLHO_M, (caixa.min[2] + caixa.max[2]) / 2],
    yaw: 0,
    pitch: 0,
  };
}

/**
 * Um quadro de movimento: W/S (ou setas) frente e trás no plano do yaw, A/D lateral, Q/E e Page Up/Down sobem e
 * descem, Shift corre. O joystick da tela (x para a direita, y para baixo, cada um em −1…1) soma ao teclado; o
 * deslocamento no plano nunca passa da velocidade cheia. Sem movimento, devolve o MESMO objeto.
 */
export function passoDoAndar(
  e: EstadoAndar,
  teclas: ReadonlySet<string>,
  dt: number,
  joystick?: { x: number; y: number },
): EstadoAndar {
  let frente = eixo(teclas, FRENTE, TRAS);
  let lado = eixo(teclas, DIREITA, ESQUERDA);
  const vertical = eixo(teclas, SOBE, DESCE);
  if (joystick) {
    frente -= joystick.y;
    lado += joystick.x;
  }
  const modulo = Math.hypot(frente, lado);
  if (modulo > 1) {
    frente /= modulo;
    lado /= modulo;
  }
  if (dt <= 0 || (frente === 0 && lado === 0 && vertical === 0)) return e;

  const distancia = VELOCIDADE_M_S * (algum(teclas, CORRE) ? FATOR_CORRER : 1) * dt;
  const sen = Math.sin(e.yaw);
  const cos = Math.cos(e.yaw);
  // Frente no plano = (−sen, 0, −cos); direita = (cos, 0, −sen).
  const dx = (-sen * frente + cos * lado) * distancia;
  const dz = (-cos * frente - sen * lado) * distancia;
  return { ...e, pos: [e.pos[0] + dx, e.pos[1] + vertical * distancia, e.pos[2] + dz] };
}

/** Gira o olhar (radianos): `dYaw` positivo vira para a esquerda, `dPitch` positivo olha para cima; pitch até ±85°. */
export function olhar(e: EstadoAndar, dYaw: number, dPitch: number): EstadoAndar {
  const pitch = Math.max(-PITCH_MAXIMO_RAD, Math.min(PITCH_MAXIMO_RAD, e.pitch + dPitch));
  return { ...e, yaw: e.yaw + dYaw, pitch };
}

/** Ponto 1 m à frente do olho, na direção do olhar — o alvo da câmera. */
export function alvoDoOlhar(e: EstadoAndar): Vec3 {
  const cp = Math.cos(e.pitch);
  return [e.pos[0] - Math.sin(e.yaw) * cp, e.pos[1] + Math.sin(e.pitch), e.pos[2] - Math.cos(e.yaw) * cp];
}

/** Categorias IFC de fundação: ficam fora do piso do pavimento (sapata e estaca descem abaixo da laje). */
const CATEGORIAS_FUNDACAO: ReadonlySet<string> = new Set([
  "IFCFOOTING",
  "IFCPILE",
  "IFCDEEPFOUNDATION",
  "IFCCAISSONFOUNDATION",
]);

/** A categoria IFC (qualquer caixa) é de fundação. */
export function ehFundacao(categoria: string | null | undefined): boolean {
  return !!categoria && CATEGORIAS_FUNDACAO.has(categoria.toUpperCase());
}

/**
 * A regra ÚNICA do piso de um pavimento (andar e alturas do portal): os elementos que entram no `pisoDoPavimento` do
 * motor. Sem as fundações; se o pavimento só tem fundação (ou nada sobra), ficam todos e `soFundacao` = true. Elemento
 * sem categoria conta como comum.
 */
export function elementosDoPiso<T extends { category?: string | null }>(
  elementos: readonly T[],
): { elementos: T[]; soFundacao: boolean } {
  const semFundacao = elementos.filter((e) => !ehFundacao(e.category));
  if (semFundacao.length > 0) return { elementos: semFundacao, soFundacao: false };
  return { elementos: [...elementos], soFundacao: elementos.length > 0 };
}

/**
 * O pavimento onde o andar entra sem escolha: o de piso conhecido mais baixo, pulando os só de fundação; se todos são só
 * de fundação, o mais baixo deles; sem piso conhecido, null.
 */
export function maisBaixoParaAndar<T extends { pisoY: number; soFundacao?: boolean }>(pavimentos: readonly T[]): T | null {
  const conhecidos = pavimentos.filter((p) => Number.isFinite(p.pisoY));
  const comuns = conhecidos.filter((p) => !p.soFundacao);
  let melhor: T | null = null;
  for (const p of comuns.length > 0 ? comuns : conhecidos) if (!melhor || p.pisoY < melhor.pisoY) melhor = p;
  return melhor;
}

/**
 * Piso onde o andar começa quando nenhum pavimento foi escolhido: o pavimento mais baixo com piso conhecido; sem
 * pavimento, o fundo da caixa da cena; sem nada na cena, null.
 */
export function pisoDeEntrada(pisos: readonly number[], caixas: readonly { min: Vec3; max: Vec3 }[]): number | null {
  const conhecidos = pisos.filter(Number.isFinite);
  if (conhecidos.length > 0) return Math.min(...conhecidos);
  const fundos = caixas.map((c) => c.min[1]).filter(Number.isFinite);
  return fundos.length > 0 ? Math.min(...fundos) : null;
}
