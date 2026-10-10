/**
 * Coordenação BIM — desfazer/refazer da PRÉVIA do realinhamento (puro).
 *
 * Um arraste sem querer move o modelo; Ctrl+Z volta ao estado anterior (vetor + giro).
 * Cada passo é um retrato completo do estado, não uma diferença: desfazer é só trocar o
 * estado atual pelo de cima da pilha. Edições seguidas no MESMO campo (digitar "12,5"
 * gera várias mudanças) e toques seguidos de teclado contam como um passo só, para o
 * Ctrl+Z não voltar dígito a dígito nem toque a toque.
 */
import type { Vec3 } from "@/modules/coordenacao/viewer/coords";

export type EstadoRealinhamento = { vetor: Vec3; graus: number };

/** De onde veio a mudança — só mudanças seguidas do mesmo campo se juntam. */
export type OrigemPasso = "arraste" | "pontos" | "campo-vetor" | "campo-giro" | "botao-giro" | "teclado";

export type HistoricoRealinhamento = {
  desfazer: EstadoRealinhamento[];
  refazer: EstadoRealinhamento[];
  /** Último passo registrado: origem e instante (ms), para juntar a digitação. */
  ultimo: { origem: OrigemPasso; em: number } | null;
};

/** Passos guardados no máximo — o bastante para errar e voltar, sem crescer à toa. */
export const LIMITE_PASSOS = 100;

/** Mudanças do mesmo campo com menos que isso entre si viram um passo só (ms). */
export const JANELA_DIGITACAO_MS = 1000;

export function historicoVazio(): HistoricoRealinhamento {
  return { desfazer: [], refazer: [], ultimo: null };
}

function iguais(a: EstadoRealinhamento, b: EstadoRealinhamento): boolean {
  return a.graus === b.graus && a.vetor.every((v, i) => v === b.vetor[i]);
}

function copia(e: EstadoRealinhamento): EstadoRealinhamento {
  return { vetor: [e.vetor[0], e.vetor[1], e.vetor[2]], graus: e.graus };
}

/**
 * Registra o estado ANTES de uma mudança. Não registra se for continuação da mesma
 * digitação, nem se o estado for igual ao último guardado. Toda mudança nova apaga o
 * que dava para refazer.
 */
export function registrarAntes(
  h: HistoricoRealinhamento,
  antes: EstadoRealinhamento,
  origem: OrigemPasso,
  agora: number,
): HistoricoRealinhamento {
  // Digitar num campo ou segurar uma seta gera várias mudanças: viram um passo só.
  const continuacao =
    (origem === "campo-vetor" || origem === "campo-giro" || origem === "teclado") &&
    h.ultimo?.origem === origem &&
    agora - h.ultimo.em < JANELA_DIGITACAO_MS;
  const ultimo = { origem, em: agora };
  if (continuacao) return { ...h, refazer: [], ultimo };
  const topo = h.desfazer[h.desfazer.length - 1];
  if (topo && iguais(topo, antes)) return { ...h, refazer: [], ultimo };
  const desfazer = [...h.desfazer, copia(antes)].slice(-LIMITE_PASSOS);
  return { desfazer, refazer: [], ultimo };
}

/** Volta um passo. Null quando não há o que desfazer. */
export function desfazer(
  h: HistoricoRealinhamento,
  atual: EstadoRealinhamento,
): { historico: HistoricoRealinhamento; estado: EstadoRealinhamento } | null {
  const anterior = h.desfazer[h.desfazer.length - 1];
  if (!anterior) return null;
  return {
    estado: copia(anterior),
    historico: { desfazer: h.desfazer.slice(0, -1), refazer: [...h.refazer, copia(atual)], ultimo: null },
  };
}

/** Refaz o que foi desfeito. Null quando não há o que refazer. */
export function refazer(
  h: HistoricoRealinhamento,
  atual: EstadoRealinhamento,
): { historico: HistoricoRealinhamento; estado: EstadoRealinhamento } | null {
  const proximo = h.refazer[h.refazer.length - 1];
  if (!proximo) return null;
  return {
    estado: copia(proximo),
    historico: { desfazer: [...h.desfazer, copia(atual)], refazer: h.refazer.slice(0, -1), ultimo: null },
  };
}

/** Tecla → comando: Ctrl/⌘+Z desfaz; Ctrl/⌘+Shift+Z e Ctrl+Y refazem. */
export function comandoDeHistorico(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): "desfazer" | "refazer" | null {
  if (!e.ctrlKey && !e.metaKey) return null;
  const tecla = e.key.toLowerCase();
  if (tecla === "z") return e.shiftKey ? "refazer" : "desfazer";
  if (tecla === "y") return "refazer";
  return null;
}
