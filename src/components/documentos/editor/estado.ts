import type { DocSchema, Elemento, TipoBanda } from "@/modules/documentos/schema";

/**
 * Estado do editor com undo/redo.
 * Ações com `commit` empilham o snapshot anterior no histórico;
 * mudanças "ao vivo" (arrastar) não poluem o histórico.
 */

export type Selecao =
  | { tipo: "nenhuma" }
  | { tipo: "banda"; bandaId: string }
  | { tipo: "elemento"; bandaId: string; elementoId: string };

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
  | { t: "removeElemento"; bandaId: string; elementoId: string }
  | { t: "duplicarElemento"; bandaId: string; elementoId: string; novoId: string }
  | { t: "alturaBanda"; bandaId: string; altura: number; commit: boolean }
  | { t: "updatePagina"; patch: Partial<DocSchema["pagina"]> }
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
