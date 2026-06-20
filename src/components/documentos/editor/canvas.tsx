"use client";

import { useRef, useState } from "react";
import type { Dispatch } from "react";
import { cn } from "@/lib/utils";
import { BANDA_LABEL, MM_TO_PX, type Banda, type DocSchema, type Elemento } from "@/modules/documentos/schema";
import { snap, snapGuia, type EditorAction, type Guias, type Selecao } from "./estado";
import { ElementoView } from "./elemento-view";

/** Retângulo do marquee em coordenadas locais da banda (px, antes do zoom). */
type Marquee = { x0: number; y0: number; x1: number; y1: number };

/** Largura/altura das réguas (px de tela, fora do zoom do canvas). */
const REGUA = 18;

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

/**
 * Ordem visual das bandas (report designer): grupoCabecalho antes da detalhe,
 * grupoRodape logo depois. Mantém o mesmo empilhamento do render final.
 */
const ORDEM_BANDAS: Banda["tipo"][] = [
  "cabecalho",
  "cabecalhoPagina",
  "grupoCabecalho",
  "detalhe",
  "grupoRodape",
  "rodapePagina",
  "rodape",
];

export function Canvas({
  schema,
  selecao,
  zoom,
  guias,
  dispatch,
}: {
  schema: DocSchema;
  selecao: Selecao;
  zoom: number;
  guias?: Guias;
  dispatch: Dispatch<EditorAction>;
}) {
  const guiasSeguro: Guias = guias ?? { x: [], y: [] };
  const [mostrarReguas, setMostrarReguas] = useState(true);
  const larguraUtil =
    schema.pagina.largura - schema.pagina.margem.esquerda - schema.pagina.margem.direita;

  const bandasOrdenadas = [...schema.bandas].sort(
    (a, b) => ORDEM_BANDAS.indexOf(a.tipo) - ORDEM_BANDAS.indexOf(b.tipo),
  );

  // Offsets verticais (px) do topo da área útil de cada banda no empilhamento.
  // Servem para mapear y "global de página" ↔ y "local da banda" no snap às
  // guias horizontais.
  const offsets = new Map<string, number>();
  let acumulado = 0;
  for (const b of bandasOrdenadas) {
    offsets.set(b.id, acumulado);
    acumulado += b.altura;
  }
  const alturaConteudo = acumulado; // soma das alturas das bandas

  return (
    <div className="relative flex-1 overflow-auto bg-muted/40 p-6">
      {/* Toggle de réguas/guias */}
      <div className="sticky top-0 z-30 mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMostrarReguas((v) => !v)}
          className={cn(
            "rounded-sm border px-2 py-1 text-xs",
            mostrarReguas
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50",
          )}
          title="Mostrar/ocultar réguas e guias"
        >
          Réguas {mostrarReguas ? "ativas" : "ocultas"}
        </button>
        {mostrarReguas && (guiasSeguro.x.length > 0 || guiasSeguro.y.length > 0) && (
          <button
            type="button"
            onClick={() => dispatch({ t: "limparGuias" })}
            className="rounded-sm border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
            title="Remover todas as guias"
          >
            Limpar guias
          </button>
        )}
        {mostrarReguas && (
          <span className="text-[11px] text-muted-foreground">
            Arraste das réguas para criar guias · duplo-clique numa guia para removê-la
          </span>
        )}
      </div>

      <div
        style={{
          width: schema.pagina.largura * zoom + (mostrarReguas ? REGUA : 0),
        }}
      >
        {/* Régua horizontal (topo) */}
        {mostrarReguas && (
          <ReguaHorizontal
            largura={schema.pagina.largura}
            margemEsq={schema.pagina.margem.esquerda}
            larguraUtil={larguraUtil}
            zoom={zoom}
            guias={guiasSeguro}
            dispatch={dispatch}
          />
        )}

        <div className="flex">
          {/* Régua vertical (lateral) */}
          {mostrarReguas && (
            <ReguaVertical
              margemTopo={schema.pagina.margem.topo}
              alturaConteudo={alturaConteudo}
              zoom={zoom}
              guias={guiasSeguro}
              dispatch={dispatch}
            />
          )}

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
                if (e.target === e.currentTarget)
                  dispatch({ t: "selecionar", selecao: { tipo: "nenhuma" } });
              }}
            >
              {/* margem do topo */}
              <div
                style={{ height: schema.pagina.margem.topo }}
                className="border-b border-dashed border-neutral-200"
              />
              <div
                style={{
                  paddingLeft: schema.pagina.margem.esquerda,
                  paddingRight: schema.pagina.margem.direita,
                }}
              >
                {/* Wrapper SEM padding: a origem (0,0) coincide com a área útil
                    das bandas — referência para a camada de guias. */}
                <div className="relative" style={{ width: larguraUtil }}>
                  {bandasOrdenadas.map((banda) => (
                    <BandaView
                      key={banda.id}
                      banda={banda}
                      larguraUtil={larguraUtil}
                      selecao={selecao}
                      zoom={zoom}
                      guias={guiasSeguro}
                      offsetBanda={offsets.get(banda.id) ?? 0}
                      dispatch={dispatch}
                    />
                  ))}

                  {/* Camada de guias sobre toda a área útil (todas as bandas).
                      Guias x = verticais; guias y = horizontais. */}
                  {mostrarReguas && (
                    <GuiasOverlay
                      guias={guiasSeguro}
                      larguraUtil={larguraUtil}
                      alturaConteudo={alturaConteudo}
                      zoom={zoom}
                      dispatch={dispatch}
                    />
                  )}
                </div>
              </div>
              <div
                style={{ height: schema.pagina.margem.baixo }}
                className="border-t border-dashed border-neutral-200"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Régua horizontal: marcações a cada 10mm (linha maior + rótulo) e 5mm (traço
 * menor) ao longo da largura da página. Arrastar a partir dela cria uma guia
 * vertical (guias.x) na posição relativa à área útil (descontando a margem).
 */
function ReguaHorizontal({
  largura,
  margemEsq,
  larguraUtil,
  zoom,
  guias,
  dispatch,
}: {
  largura: number;
  margemEsq: number;
  larguraUtil: number;
  zoom: number;
  guias: Guias;
  dispatch: Dispatch<EditorAction>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function criar(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // x em px de página (espaço do conteúdo, antes do zoom), descontando a margem.
    const aplicar = (clientX: number, indice: number | null) => {
      const xPagina = (clientX - rect.left) / zoom - margemEsq;
      const pos = Math.max(0, Math.min(larguraUtil, snap(xPagina)));
      if (indice === null) {
        dispatch({ t: "addGuia", eixo: "x", pos });
      } else {
        dispatch({ t: "moverGuia", eixo: "x", indice, pos });
      }
    };
    const indiceNovo = guias.x.length; // a guia recém-criada
    aplicar(e.clientX, null);
    function move(ev: PointerEvent) {
      aplicar(ev.clientX, indiceNovo);
    }
    function up(ev: PointerEvent) {
      aplicar(ev.clientX, indiceNovo);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const marcacoes = ticks(largura);

  return (
    <div className="flex">
      {/* canto vazio (interseção das réguas) */}
      <div style={{ width: REGUA, height: REGUA }} className="shrink-0 border-b border-r bg-neutral-100" />
      <div
        ref={ref}
        onPointerDown={criar}
        title="Arraste para criar uma guia vertical"
        className="relative cursor-ew-resize select-none border-b bg-neutral-100"
        style={{ width: largura * zoom, height: REGUA }}
      >
        {marcacoes.map((m) => (
          <div
            key={m.px}
            className="absolute bottom-0 border-l border-neutral-400"
            style={{ left: m.px * zoom, height: m.maior ? REGUA : REGUA / 2 }}
          >
            {m.maior && (
              <span className="absolute left-0.5 top-0 text-[7px] leading-none text-neutral-500">
                {m.mm}
              </span>
            )}
          </div>
        ))}
        {/* marcador da margem esquerda */}
        <div
          className="absolute bottom-0 top-0 border-l border-dashed border-blue-300"
          style={{ left: margemEsq * zoom }}
        />
      </div>
    </div>
  );
}

/**
 * Régua vertical: marcações a cada 10/5mm ao longo da área útil. Arrastar cria
 * uma guia horizontal (guias.y) na posição relativa ao topo da área útil
 * (descontando a margem do topo).
 */
function ReguaVertical({
  margemTopo,
  alturaConteudo,
  zoom,
  guias,
  dispatch,
}: {
  margemTopo: number;
  alturaConteudo: number;
  zoom: number;
  guias: Guias;
  dispatch: Dispatch<EditorAction>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const alturaTotal = margemTopo + alturaConteudo;

  function criar(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const aplicar = (clientY: number, indice: number | null) => {
      const yPagina = (clientY - rect.top) / zoom - margemTopo;
      const pos = Math.max(0, Math.min(alturaConteudo, snap(yPagina)));
      if (indice === null) {
        dispatch({ t: "addGuia", eixo: "y", pos });
      } else {
        dispatch({ t: "moverGuia", eixo: "y", indice, pos });
      }
    };
    const indiceNovo = guias.y.length;
    aplicar(e.clientY, null);
    function move(ev: PointerEvent) {
      aplicar(ev.clientY, indiceNovo);
    }
    function up(ev: PointerEvent) {
      aplicar(ev.clientY, indiceNovo);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const marcacoes = ticks(alturaTotal);

  return (
    <div
      ref={ref}
      onPointerDown={criar}
      title="Arraste para criar uma guia horizontal"
      className="relative shrink-0 cursor-ns-resize select-none border-r bg-neutral-100"
      style={{ width: REGUA, height: alturaTotal * zoom }}
    >
      {marcacoes.map((m) => (
        <div
          key={m.px}
          className="absolute right-0 border-t border-neutral-400"
          style={{ top: m.px * zoom, width: m.maior ? REGUA : REGUA / 2 }}
        >
          {m.maior && (
            <span className="absolute left-0 top-0 origin-top-left rotate-90 text-[7px] leading-none text-neutral-500">
              {m.mm}
            </span>
          )}
        </div>
      ))}
      {/* marcador da margem do topo */}
      <div
        className="absolute left-0 right-0 border-t border-dashed border-blue-300"
        style={{ top: margemTopo * zoom }}
      />
    </div>
  );
}

/** Gera marcações de régua: a cada 5mm (menor) e 10mm (maior, com rótulo). */
function ticks(comprimentoPx: number): { px: number; mm: number; maior: boolean }[] {
  const out: { px: number; mm: number; maior: boolean }[] = [];
  const passoMm = 5;
  const maxMm = Math.floor(comprimentoPx / MM_TO_PX);
  for (let mm = 0; mm <= maxMm; mm += passoMm) {
    out.push({ px: mm * MM_TO_PX, mm, maior: mm % 10 === 0 });
  }
  return out;
}

/**
 * Camada de guias arrastáveis sobre toda a área útil. As guias verticais
 * (guias.x) e horizontais (guias.y) podem ser arrastadas para reposicionar e
 * removidas com duplo-clique. Não captura cliques fora das próprias linhas
 * (pointer-events só nas guias).
 */
function GuiasOverlay({
  guias,
  larguraUtil,
  alturaConteudo,
  zoom,
  dispatch,
}: {
  guias: Guias;
  larguraUtil: number;
  alturaConteudo: number;
  zoom: number;
  dispatch: Dispatch<EditorAction>;
}) {
  function arrastar(eixo: "x" | "y", indice: number, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Origem em coordenadas de página: usamos a própria área útil como referência
    // via o elemento pai posicionado. Convertendo pelo bounding do alvo.
    const overlay = (e.currentTarget as HTMLElement).parentElement;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    function move(ev: PointerEvent) {
      if (eixo === "x") {
        const pos = Math.max(0, Math.min(larguraUtil, snap((ev.clientX - rect.left) / zoom)));
        dispatch({ t: "moverGuia", eixo: "x", indice, pos });
      } else {
        const pos = Math.max(0, Math.min(alturaConteudo, snap((ev.clientY - rect.top) / zoom)));
        dispatch({ t: "moverGuia", eixo: "y", indice, pos });
      }
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30">

      {guias.x.map((x, i) => (
        <div
          key={`gx_${i}`}
          className="pointer-events-auto absolute top-0 -ml-1 w-2 cursor-ew-resize"
          style={{ left: x, height: alturaConteudo }}
          onPointerDown={(e) => arrastar("x", i, e)}
          onDoubleClick={() => dispatch({ t: "removeGuia", eixo: "x", indice: i })}
          title="Arraste para mover · duplo-clique para remover"
        >
          <div className="absolute left-1 top-0 h-full w-px bg-fuchsia-500/70" />
        </div>
      ))}
      {guias.y.map((y, i) => (
        <div
          key={`gy_${i}`}
          className="pointer-events-auto absolute left-0 -mt-1 h-2 w-full cursor-ns-resize"
          style={{ top: y, width: larguraUtil }}
          onPointerDown={(e) => arrastar("y", i, e)}
          onDoubleClick={() => dispatch({ t: "removeGuia", eixo: "y", indice: i })}
          title="Arraste para mover · duplo-clique para remover"
        >
          <div className="absolute left-0 top-1 h-px w-full bg-fuchsia-500/70" />
        </div>
      ))}
    </div>
  );
}

function BandaView({
  banda,
  larguraUtil,
  selecao,
  zoom,
  guias,
  offsetBanda,
  dispatch,
}: {
  banda: Banda;
  larguraUtil: number;
  selecao: Selecao;
  zoom: number;
  guias: Guias;
  /** Offset vertical (px) do topo da banda na pilha — converte guias y → local. */
  offsetBanda: number;
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

  // Guias horizontais serão convertidas ao espaço LOCAL da banda (subtraindo o
  // offset acumulado) ao repassar para cada elemento (snap).

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
            guiasX={guias.x}
            guiasYLocais={guias.y.map((y) => y - offsetBanda)}
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
  guiasX,
  guiasYLocais,
  dispatch,
}: {
  bandaId: string;
  el: Elemento;
  zoom: number;
  selecionado: boolean;
  /** Todos os ids selecionados nesta banda (para drag em grupo). */
  selIds: string[];
  /** Guias verticais (x) no espaço da área útil — alvos de snap. */
  guiasX: number[];
  /** Guias horizontais (y) já convertidas ao espaço LOCAL da banda. */
  guiasYLocais: number[];
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

  /**
   * Aplica snap às guias nas bordas (esq/dir) e (topo/base) do elemento, além do
   * snap 8px já aplicado em `x`/`y`. Tenta encaixar a borda esquerda OU direita à
   * guia vertical mais próxima e a borda superior OU inferior à horizontal.
   */
  function snapGuiasPos(x: number, y: number): { x: number; y: number } {
    let nx = x;
    let ny = y;
    if (guiasX.length) {
      const esq = snapGuia(x, guiasX);
      if (esq !== x) nx = esq;
      else {
        const dir = snapGuia(x + el.w, guiasX);
        if (dir !== x + el.w) nx = dir - el.w;
      }
    }
    if (guiasYLocais.length) {
      const topo = snapGuia(y, guiasYLocais);
      if (topo !== y) ny = topo;
      else {
        const base = snapGuia(y + el.h, guiasYLocais);
        if (base !== y + el.h) ny = base - el.h;
      }
    }
    return { x: Math.max(0, nx), y: Math.max(0, ny) };
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
      const base = {
        x: Math.max(0, snap(orig.x + (ev.clientX - startX) / zoom)),
        y: Math.max(0, snap(orig.y + (ev.clientY - startY) / zoom)),
      };
      // Snap às guias por cima do snap 8px.
      return snapGuiasPos(base.x, base.y);
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
      let w = Math.max(8, snap(orig.w + (ev.clientX - startX) / zoom));
      let h = Math.max(4, snap(orig.h + (ev.clientY - startY) / zoom));
      // Snap da borda direita/inferior às guias (mantendo x/y).
      if (guiasX.length) {
        const dir = snapGuia(el.x + w, guiasX);
        if (dir !== el.x + w) w = Math.max(8, dir - el.x);
      }
      if (guiasYLocais.length) {
        const base = snapGuia(el.y + h, guiasYLocais);
        if (base !== el.y + h) h = Math.max(4, base - el.y);
      }
      return { w, h };
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
