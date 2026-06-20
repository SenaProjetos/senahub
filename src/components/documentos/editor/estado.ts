import type { DocSchema, Elemento, TipoBanda } from "@/modules/documentos/schema";

/**
 * Estado do editor com undo/redo.
 * Ações com `commit` empilham o snapshot anterior no histórico;
 * mudanças "ao vivo" (arrastar) não poluem o histórico.
 */

export type Selecao =
  | { tipo: "nenhuma" }
  | { tipo: "banda"; bandaId: string }
  | { tipo: "elemento"; bandaId: string; elementoId: string }
  | { tipo: "multi"; bandaId: string; ids: string[] };

/** Eixos para alinhamento de uma multi-seleção. */
export type AlinharEixo =
  | "esquerda"
  | "centroH"
  | "direita"
  | "topo"
  | "meio"
  | "base";

/** Eixos para distribuição uniforme de uma multi-seleção. */
export type DistribuirEixo = "horizontal" | "vertical";

export type EditorState = {
  schema: DocSchema;
  selecao: Selecao;
  past: DocSchema[];
  future: DocSchema[];
  sujo: boolean;
};

export type EditorAction =
  | { t: "selecionar"; selecao: Selecao }
  | { t: "addElemento"; bandaId: string; elemento: Elemento }
  | { t: "updateElemento"; bandaId: string; elementoId: string; patch: Partial<Elemento>; commit: boolean }
  | { t: "moverMultiplos"; bandaId: string; ids: string[]; dx: number; dy: number; commit: boolean }
  | { t: "alinhar"; bandaId: string; ids: string[]; eixo: AlinharEixo }
  | { t: "distribuir"; bandaId: string; ids: string[]; eixo: DistribuirEixo }
  | { t: "inserirElementos"; bandaId: string; elementos: Elemento[] }
  | { t: "removeElemento"; bandaId: string; elementoId: string }
  | { t: "duplicarElemento"; bandaId: string; elementoId: string; novoId: string }
  | { t: "alturaBanda"; bandaId: string; altura: number; commit: boolean }
  | { t: "updatePagina"; patch: Partial<DocSchema["pagina"]> }
  | { t: "setAgrupamento"; campo: string }
  | { t: "addBanda"; tipo: TipoBanda; id: string }
  | { t: "removeBanda"; bandaId: string }
  | { t: "undo" }
  | { t: "redo" }
  | { t: "marcarSalvo" };

const MAX_HIST = 50;

function push(state: EditorState, novo: DocSchema): EditorState {
  return {
    ...state,
    schema: novo,
    past: [...state.past.slice(-MAX_HIST), state.schema],
    future: [],
    sujo: true,
  };
}

function live(state: EditorState, novo: DocSchema): EditorState {
  return { ...state, schema: novo, sujo: true };
}

function mapBanda(s: DocSchema, bandaId: string, fn: (b: DocSchema["bandas"][number]) => DocSchema["bandas"][number]): DocSchema {
  return { ...s, bandas: s.bandas.map((b) => (b.id === bandaId ? fn(b) : b)) };
}

export function editorReducer(state: EditorState, a: EditorAction): EditorState {
  switch (a.t) {
    case "selecionar":
      return { ...state, selecao: a.selecao };

    case "addElemento": {
      const novo = mapBanda(state.schema, a.bandaId, (b) => ({
        ...b,
        elementos: [...b.elementos, a.elemento],
      }));
      return {
        ...push(state, novo),
        selecao: { tipo: "elemento", bandaId: a.bandaId, elementoId: a.elemento.id },
      };
    }

    case "updateElemento": {
      const novo = mapBanda(state.schema, a.bandaId, (b) => ({
        ...b,
        elementos: b.elementos.map((e) => (e.id === a.elementoId ? { ...e, ...a.patch } : e)),
      }));
      return a.commit ? push(state, novo) : live(state, novo);
    }

    case "moverMultiplos": {
      const ids = new Set(a.ids);
      const novo = mapBanda(state.schema, a.bandaId, (b) => ({
        ...b,
        elementos: b.elementos.map((e) =>
          ids.has(e.id) && !e.travado
            ? { ...e, x: Math.max(0, e.x + a.dx), y: Math.max(0, e.y + a.dy) }
            : e,
        ),
      }));
      return a.commit ? push(state, novo) : live(state, novo);
    }

    case "alinhar": {
      const banda = state.schema.bandas.find((b) => b.id === a.bandaId);
      if (!banda) return state;
      const sel = banda.elementos.filter((e) => a.ids.includes(e.id) && !e.travado);
      if (sel.length < 2) return state;
      const posicoes = alinharPosicoes(sel, a.eixo);
      const novo = mapBanda(state.schema, a.bandaId, (b) => ({
        ...b,
        elementos: b.elementos.map((e) => (e.id in posicoes ? { ...e, ...posicoes[e.id] } : e)),
      }));
      return push(state, novo);
    }

    case "distribuir": {
      const banda = state.schema.bandas.find((b) => b.id === a.bandaId);
      if (!banda) return state;
      const sel = banda.elementos.filter((e) => a.ids.includes(e.id) && !e.travado);
      if (sel.length < 3) return state;
      const posicoes = distribuirPosicoes(sel, a.eixo);
      const novo = mapBanda(state.schema, a.bandaId, (b) => ({
        ...b,
        elementos: b.elementos.map((e) => (e.id in posicoes ? { ...e, ...posicoes[e.id] } : e)),
      }));
      return push(state, novo);
    }

    case "inserirElementos": {
      if (a.elementos.length === 0) return state;
      const novo = mapBanda(state.schema, a.bandaId, (b) => ({
        ...b,
        elementos: [...b.elementos, ...a.elementos],
      }));
      const sel: Selecao =
        a.elementos.length === 1
          ? { tipo: "elemento", bandaId: a.bandaId, elementoId: a.elementos[0].id }
          : { tipo: "multi", bandaId: a.bandaId, ids: a.elementos.map((e) => e.id) };
      return { ...push(state, novo), selecao: sel };
    }

    case "removeElemento": {
      const novo = mapBanda(state.schema, a.bandaId, (b) => ({
        ...b,
        elementos: b.elementos.filter((e) => e.id !== a.elementoId),
      }));
      return { ...push(state, novo), selecao: { tipo: "nenhuma" } };
    }

    case "duplicarElemento": {
      const banda = state.schema.bandas.find((b) => b.id === a.bandaId);
      const el = banda?.elementos.find((e) => e.id === a.elementoId);
      if (!el) return state;
      const copia: Elemento = { ...el, id: a.novoId, x: el.x + 16, y: el.y + 16 };
      const novo = mapBanda(state.schema, a.bandaId, (b) => ({
        ...b,
        elementos: [...b.elementos, copia],
      }));
      return {
        ...push(state, novo),
        selecao: { tipo: "elemento", bandaId: a.bandaId, elementoId: copia.id },
      };
    }

    case "alturaBanda": {
      const novo = mapBanda(state.schema, a.bandaId, (b) => ({ ...b, altura: a.altura }));
      return a.commit ? push(state, novo) : live(state, novo);
    }

    case "updatePagina": {
      const novo: DocSchema = {
        ...state.schema,
        pagina: {
          ...state.schema.pagina,
          ...a.patch,
          margem: { ...state.schema.pagina.margem, ...(a.patch.margem ?? {}) },
        },
      };
      return push(state, novo);
    }

    case "setAgrupamento": {
      const novo: DocSchema = { ...state.schema, agruparPor: a.campo };
      return push(state, novo);
    }

    case "addBanda": {
      const novo: DocSchema = {
        ...state.schema,
        bandas: [...state.schema.bandas, { id: a.id, tipo: a.tipo, altura: 60, elementos: [] }],
      };
      return push(state, novo);
    }

    case "removeBanda": {
      const novo: DocSchema = {
        ...state.schema,
        bandas: state.schema.bandas.filter((b) => b.id !== a.bandaId),
      };
      return { ...push(state, novo), selecao: { tipo: "nenhuma" } };
    }

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        schema: prev,
        past: state.past.slice(0, -1),
        future: [state.schema, ...state.future],
        sujo: true,
        selecao: { tipo: "nenhuma" },
      };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        schema: next,
        past: [...state.past, state.schema],
        future: state.future.slice(1),
        sujo: true,
        selecao: { tipo: "nenhuma" },
      };
    }

    case "marcarSalvo":
      return { ...state, sujo: false };
  }
}

export const SNAP = 8;
export function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

type PosPatch = Partial<Pick<Elemento, "x" | "y">>;

/**
 * Calcula as novas posições (x/y) para alinhar uma seleção de elementos.
 * Função pura: recebe os elementos e o eixo, devolve um mapa id → {x?,y?}.
 * Alinhamentos horizontais (esquerda/centroH/direita) usam a caixa-limite
 * do conjunto; verticais (topo/meio/base) idem no eixo Y.
 */
export function alinharPosicoes(els: Elemento[], eixo: AlinharEixo): Record<string, PosPatch> {
  const minX = Math.min(...els.map((e) => e.x));
  const maxX = Math.max(...els.map((e) => e.x + e.w));
  const minY = Math.min(...els.map((e) => e.y));
  const maxY = Math.max(...els.map((e) => e.y + e.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const out: Record<string, PosPatch> = {};
  for (const e of els) {
    switch (eixo) {
      case "esquerda":
        out[e.id] = { x: Math.max(0, snap(minX)) };
        break;
      case "centroH":
        out[e.id] = { x: Math.max(0, snap(cx - e.w / 2)) };
        break;
      case "direita":
        out[e.id] = { x: Math.max(0, snap(maxX - e.w)) };
        break;
      case "topo":
        out[e.id] = { y: Math.max(0, snap(minY)) };
        break;
      case "meio":
        out[e.id] = { y: Math.max(0, snap(cy - e.h / 2)) };
        break;
      case "base":
        out[e.id] = { y: Math.max(0, snap(maxY - e.h)) };
        break;
    }
  }
  return out;
}

/**
 * Distribui uniformemente o espaço (gaps iguais) entre os elementos no eixo.
 * Mantém o primeiro e o último nas extremidades; reposiciona os do meio.
 * Função pura. Requer 3+ elementos para ter efeito.
 */
export function distribuirPosicoes(els: Elemento[], eixo: DistribuirEixo): Record<string, PosPatch> {
  const out: Record<string, PosPatch> = {};
  if (els.length < 3) return out;
  if (eixo === "horizontal") {
    const ord = [...els].sort((a, b) => a.x - b.x);
    const inicio = ord[0].x;
    const fim = ord[ord.length - 1].x + ord[ord.length - 1].w;
    const somaLarg = ord.reduce((s, e) => s + e.w, 0);
    const gap = (fim - inicio - somaLarg) / (ord.length - 1);
    let cursor = inicio;
    for (const e of ord) {
      out[e.id] = { x: Math.max(0, snap(cursor)) };
      cursor += e.w + gap;
    }
  } else {
    const ord = [...els].sort((a, b) => a.y - b.y);
    const inicio = ord[0].y;
    const fim = ord[ord.length - 1].y + ord[ord.length - 1].h;
    const somaAlt = ord.reduce((s, e) => s + e.h, 0);
    const gap = (fim - inicio - somaAlt) / (ord.length - 1);
    let cursor = inicio;
    for (const e of ord) {
      out[e.id] = { y: Math.max(0, snap(cursor)) };
      cursor += e.h + gap;
    }
  }
  return out;
}
