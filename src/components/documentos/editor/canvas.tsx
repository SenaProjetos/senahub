"use client";

import { useRef, useState } from "react";
import type { Dispatch } from "react";
import { cn } from "@/lib/utils";
import { BANDA_LABEL, type Banda, type DocSchema, type Elemento } from "@/modules/documentos/schema";
import { snap, type EditorAction, type Selecao } from "./estado";
import { ElementoView } from "./elemento-view";

/** Retângulo do marquee em coordenadas locais da banda (px, antes do zoom). */
type Marquee = { x0: number; y0: number; x1: number; y1: number };

function normRect(m: Marquee) {
  return {
    left: Math.min(m.x0, m.x1),
    top: Math.min(m.y0, m.y1),
    right: Math.max(m.x0, m.x1),
    bottom: Math.max(m.y0, m.y1),
  };
}

/** Ids selecionados nesta banda (suporta seleção simples e múltipla). */
function idsSelecionados(selecao: Selecao, bandaId: string): string[] {
  if (selecao.tipo === "elemento" && selecao.bandaId === bandaId) return [selecao.elementoId];
  if (selecao.tipo === "multi" && selecao.bandaId === bandaId) return selecao.ids;
  return [];
}

export function Canvas({
  schema,
  selecao,
  zoom,
  dispatch,
}: {
  schema: DocSchema;
  selecao: Selecao;
  zoom: number;
  dispatch: Dispatch<EditorAction>;
}) {
  const larguraUtil = schema.pagina.largura - schema.pagina.margem.esquerda - schema.pagina.margem.direita;

  return (
    <div className="flex-1 overflow-auto bg-muted/40 p-6">
      <div
        style={{
          width: schema.pagina.largura * zoom,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
      >
        <div
          className="relative bg-white text-black shadow-lg"
          style={{ width: schema.pagina.largura }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) dispatch({ t: "selecionar", selecao: { tipo: "nenhuma" } });
          }}
        >
          {/* margem do topo */}
          <div style={{ height: schema.pagina.margem.topo }} className="border-b border-dashed border-neutral-200" />
          <div style={{ paddingLeft: schema.pagina.margem.esquerda, paddingRight: schema.pagina.margem.direita }}>
            {schema.bandas.map((banda) => (
              <BandaView
                key={banda.id}
                banda={banda}
                larguraUtil={larguraUtil}
                selecao={selecao}
                zoom={zoom}
                dispatch={dispatch}
              />
            ))}
          </div>
          <div style={{ height: schema.pagina.margem.baixo }} className="border-t border-dashed border-neutral-200" />
        </div>
      </div>
    </div>
  );
}

function BandaView({
  banda,
  larguraUtil,
  selecao,
  zoom,
  dispatch,
}: {
  banda: Banda;
  larguraUtil: number;
  selecao: Selecao;
  zoom: number;
  dispatch: Dispatch<EditorAction>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bandaSel = selecao.tipo === "banda" && selecao.bandaId === banda.id;
  const selIds = idsSelecionados(selecao, banda.id);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  /** Marquee: arrastar numa área vazia da banda seleciona os elementos contidos. */
  function iniciarMarquee(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const area = ref.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const toLocal = (cx: number, cy: number) => ({
      x: (cx - rect.left) / zoom,
      y: (cy - rect.top) / zoom,
    });
    const inicio = toLocal(e.clientX, e.clientY);
    let movido = false;
    let atual: Marquee = { x0: inicio.x, y0: inicio.y, x1: inicio.x, y1: inicio.y };

    function move(ev: PointerEvent) {
      const p = toLocal(ev.clientX, ev.clientY);
      atual = { x0: inicio.x, y0: inicio.y, x1: p.x, y1: p.y };
      if (Math.abs(p.x - inicio.x) > 3 || Math.abs(p.y - inicio.y) > 3) movido = true;
      setMarquee({ ...atual });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMarquee(null);
      if (!movido) {
        dispatch({ t: "selecionar", selecao: { tipo: "banda", bandaId: banda.id } });
        return;
      }
      const r = normRect(atual);
      const ids = banda.elementos
        .filter((el) => el.x < r.right && el.x + el.w > r.left && el.y < r.bottom && el.y + el.h > r.top)
        .map((el) => el.id);
      if (ids.length === 0) {
        dispatch({ t: "selecionar", selecao: { tipo: "banda", bandaId: banda.id } });
      } else if (ids.length === 1) {
        dispatch({ t: "selecionar", selecao: { tipo: "elemento", bandaId: banda.id, elementoId: ids[0] } });
      } else {
        dispatch({ t: "selecionar", selecao: { tipo: "multi", bandaId: banda.id, ids } });
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function iniciarResizeBanda(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startAltura = banda.altura;
    function move(ev: PointerEvent) {
      const delta = (ev.clientY - startY) / zoom;
      dispatch({
        t: "alturaBanda",
        bandaId: banda.id,
        altura: Math.max(8, snap(startAltura + delta)),
        commit: false,
      });
    }
    function up(ev: PointerEvent) {
      const delta = (ev.clientY - startY) / zoom;
      dispatch({
        t: "alturaBanda",
        bandaId: banda.id,
        altura: Math.max(8, snap(startAltura + delta)),
        commit: true,
      });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="relative" style={{ height: banda.altura }}>
      {/* etiqueta da banda (faixa esquerda, estilo report designer) */}
      <button
        type="button"
        onClick={() => dispatch({ t: "selecionar", selecao: { tipo: "banda", bandaId: banda.id } })}
        className={cn(
          "absolute -left-12 top-0 h-full w-10 overflow-hidden border text-[8px] uppercase tracking-wide",
          bandaSel
            ? "border-blue-500 bg-blue-50 text-blue-700"
            : "border-neutral-200 bg-neutral-50 text-neutral-400 hover:bg-neutral-100",
        )}
        title={BANDA_LABEL[banda.tipo]}
      >
        <span className="block rotate-180 [writing-mode:vertical-rl]">{BANDA_LABEL[banda.tipo]}</span>
      </button>

      {/* área da banda com grade pontilhada */}
      <div
        ref={ref}
        className={cn(
          "relative h-full w-full overflow-hidden border-b",
          bandaSel ? "border-blue-400" : "border-dashed border-neutral-300",
        )}
        style={{
          width: larguraUtil,
          backgroundImage: "radial-gradient(circle, #d4d4d4 0.5px, transparent 0.5px)",
          backgroundSize: "8px 8px",
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) iniciarMarquee(e);
        }}
      >
        {banda.elementos.map((el) => (
          <ElementoEditavel
            key={el.id}
            bandaId={banda.id}
            el={el}
            zoom={zoom}
            selecionado={selIds.includes(el.id)}
            selIds={selIds}
            dispatch={dispatch}
          />
        ))}

        {/* retângulo de marquee (seleção por arrasto) */}
        {marquee && (
          <div
            className="pointer-events-none absolute z-20 border border-blue-500 bg-blue-500/10"
            style={(() => {
              const r = normRect(marquee);
              return { left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top };
            })()}
          />
        )}
      </div>

      {/* alça de altura da banda */}
      <div
        className="absolute bottom-0 left-0 z-10 h-1.5 w-full cursor-ns-resize hover:bg-blue-300/50"
        style={{ width: larguraUtil }}
        onPointerDown={iniciarResizeBanda}
      />
    </div>
  );
}

function ElementoEditavel({
  bandaId,
  el,
  zoom,
  selecionado,
  selIds,
  dispatch,
}: {
  bandaId: string;
  el: Elemento;
  zoom: number;
  selecionado: boolean;
  /** Todos os ids selecionados nesta banda (para drag em grupo). */
  selIds: string[];
  dispatch: Dispatch<EditorAction>;
}) {
  /** Shift+clique: adiciona/remove o elemento da seleção (na mesma banda). */
  function alternarNaSelecao() {
    const conjunto = new Set(selIds);
    if (conjunto.has(el.id)) conjunto.delete(el.id);
    else conjunto.add(el.id);
    const ids = [...conjunto];
    if (ids.length === 0) dispatch({ t: "selecionar", selecao: { tipo: "banda", bandaId } });
    else if (ids.length === 1)
      dispatch({ t: "selecionar", selecao: { tipo: "elemento", bandaId, elementoId: ids[0] } });
    else dispatch({ t: "selecionar", selecao: { tipo: "multi", bandaId, ids } });
  }

  function iniciarDrag(e: React.PointerEvent) {
    if (el.travado) return;
    e.preventDefault();
    e.stopPropagation();

    // Shift+clique não arrasta: alterna a seleção e sai.
    if (e.shiftKey) {
      alternarNaSelecao();
      return;
    }

    // Se o elemento já faz parte de uma multi-seleção, arrasta o grupo todo.
    const grupo = selecionado && selIds.length > 1 ? selIds : null;
    if (!grupo) {
      dispatch({ t: "selecionar", selecao: { tipo: "elemento", bandaId, elementoId: el.id } });
    }

    const startX = e.clientX;
    const startY = e.clientY;

    if (grupo) {
      // Drag em grupo: aplica o mesmo delta a todos os selecionados.
      let ultimo = { dx: 0, dy: 0 };
      function calc(ev: PointerEvent) {
        return {
          dx: snap((ev.clientX - startX) / zoom),
          dy: snap((ev.clientY - startY) / zoom),
        };
      }
      function move(ev: PointerEvent) {
        const d = calc(ev);
        // Aplica o delta incremental (relativo ao último despacho).
        dispatch({ t: "moverMultiplos", bandaId, ids: grupo!, dx: d.dx - ultimo.dx, dy: d.dy - ultimo.dy, commit: false });
        ultimo = d;
      }
      function up(ev: PointerEvent) {
        const d = calc(ev);
        dispatch({ t: "moverMultiplos", bandaId, ids: grupo!, dx: d.dx - ultimo.dx, dy: d.dy - ultimo.dy, commit: true });
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    const orig = { x: el.x, y: el.y };
    function calc(ev: PointerEvent) {
      return {
        x: Math.max(0, snap(orig.x + (ev.clientX - startX) / zoom)),
        y: Math.max(0, snap(orig.y + (ev.clientY - startY) / zoom)),
      };
    }
    function move(ev: PointerEvent) {
      dispatch({ t: "updateElemento", bandaId, elementoId: el.id, patch: calc(ev), commit: false });
    }
    function up(ev: PointerEvent) {
      dispatch({ t: "updateElemento", bandaId, elementoId: el.id, patch: calc(ev), commit: true });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function iniciarResize(e: React.PointerEvent) {
    if (el.travado) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { w: el.w, h: el.h };
    function calc(ev: PointerEvent) {
      return {
        w: Math.max(8, snap(orig.w + (ev.clientX - startX) / zoom)),
        h: Math.max(4, snap(orig.h + (ev.clientY - startY) / zoom)),
      };
    }
    function move(ev: PointerEvent) {
      dispatch({ t: "updateElemento", bandaId, elementoId: el.id, patch: calc(ev), commit: false });
    }
    function up(ev: PointerEvent) {
      dispatch({ t: "updateElemento", bandaId, elementoId: el.id, patch: calc(ev), commit: true });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Resize só faz sentido na seleção de UM elemento; em multi-seleção, só destaca.
  const selecaoUnica = selecionado && selIds.length <= 1;

  return (
    <div
      className={cn(
        "absolute",
        el.travado ? "cursor-default" : "cursor-move",
        selecionado && "ring-1 ring-blue-500",
        selecionado && selIds.length > 1 && "ring-blue-400",
        !el.visivel && "opacity-40",
      )}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h }}
      onPointerDown={iniciarDrag}
    >
      <ElementoView el={el} />
      {selecaoUnica && !el.travado && (
        <>
          {/* alças de canto (visual) */}
          {[
            "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
            "right-0 top-0 translate-x-1/2 -translate-y-1/2",
            "left-0 bottom-0 -translate-x-1/2 translate-y-1/2",
          ].map((pos) => (
            <span key={pos} className={cn("absolute z-10 size-2 border border-blue-500 bg-white", pos)} />
          ))}
          {/* alça SE redimensiona */}
          <span
            className="absolute bottom-0 right-0 z-10 size-2.5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize border border-blue-500 bg-blue-500"
            onPointerDown={iniciarResize}
          />
        </>
      )}
    </div>
  );
}
